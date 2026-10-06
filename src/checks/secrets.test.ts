import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkSecrets } from './secrets.ts'

const roots: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const SCHEMA = `export default defineConfig({
  env: {
    schema: {
      OFFICINA_PROVA_SECRET: envField.string({ context: 'server', access: 'secret', optional: true }),
      OFFICINA_PROVA_NUMBER: envField.number({ context: 'server', access: 'secret', optional: true }),
      PUBLIC_GTM_ID: envField.string({ context: 'client', access: 'public', optional: true }),
    },
  },
})
`
const CANARY = 'officina-OFFICINA_PROVA_SECRET-canary'

function project(files: Record<string, string>, dirs: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-secrets-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true })
  return root
}

function run(root: string, args: string[] = []): { exitCode: number; out: string; err: string } {
  const out: string[] = []
  const err: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void err.push(line))
  try {
    return { exitCode: checkSecrets(args), out: out.join('\n'), err: err.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

describe('check secrets su una build', () => {
  it('una chiave nel bundle del client nomina la chiave e il file, ed esce 1', () => {
    vi.stubEnv('OFFICINA_PROVA_SECRET', CANARY)
    vi.stubEnv('OFFICINA_PROVA_NUMBER', '1234567890')
    const root = project({ 'astro.config.mjs': SCHEMA, 'dist/client/_astro/page.js': `const k="${CANARY}"` })

    const { exitCode, out } = run(root)

    expect(exitCode).toBe(1)
    expect(out).toContain('✗ dist/client/_astro/page.js: contiene il canary di `OFFICINA_PROVA_SECRET`')
    expect(out).toContain('Una chiave server e secret si legge solo nel codice che gira sul server')
  })

  it('una build pulita esce 0 e nomina le chiavi verificate', () => {
    vi.stubEnv('OFFICINA_PROVA_SECRET', CANARY)
    vi.stubEnv('OFFICINA_PROVA_NUMBER', '1234567890')
    const root = project({ 'astro.config.mjs': SCHEMA, 'dist/client/index.html': '<p>Acme</p>' })

    const { exitCode, out } = run(root)

    expect(exitCode).toBe(0)
    expect(out).toContain('2 chiavi server e secret di env.schema')
    expect(out).toContain('Verificate: OFFICINA_PROVA_SECRET, OFFICINA_PROVA_NUMBER.')
  })

  it('una chiave senza valore né canary è un avviso, e non ferma la CI', () => {
    vi.stubEnv('OFFICINA_PROVA_SECRET', CANARY)
    const root = project({ 'astro.config.mjs': SCHEMA, 'dist/client/index.html': '<p>Acme</p>' })

    const { exitCode, out } = run(root)

    expect(exitCode).toBe(0)
    expect(out).toContain('· astro.config.mjs: `OFFICINA_PROVA_NUMBER` non si verifica')
    expect(out).toContain('Verificate: OFFICINA_PROVA_SECRET.')
  })

  it('uno schema senza chiavi segrete non ha niente da verificare, nemmeno la build', () => {
    const schema =
      "export default defineConfig({ env: { schema: { A: envField.string({ context: 'client', access: 'public' }) } } })\n"

    const { exitCode, out } = run(project({ 'astro.config.mjs': schema }))

    expect(exitCode).toBe(0)
    expect(out).toContain('Nessuna chiave segreta nello schema: niente da verificare.')
  })

  it('una dist/client vuota è un fallimento: il controllo non affermerebbe niente', () => {
    const { exitCode, err } = run(project({ 'astro.config.mjs': SCHEMA }, ['dist/client']))

    expect(exitCode).toBe(1)
    expect(err).toContain('dist/client è vuota')
  })
})

describe('check secrets --canaries', () => {
  it("stampa soltanto le righe per l'ambiente della build, e solo per i campi stringa", () => {
    const { exitCode, out, err } = run(project({ 'astro.config.mjs': SCHEMA }), ['--canaries'])

    expect(exitCode).toBe(0)
    expect(out).toBe(`OFFICINA_PROVA_SECRET=${CANARY}`)
    expect(err).toBe('')
  })
})
