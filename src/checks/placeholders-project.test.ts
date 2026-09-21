import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkPlaceholders } from './placeholders.ts'

const roots: string[] = []

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-placeholders-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  return root
}

const config = (body: string) => `export default ${body}\n`

const run = async (root: string, args: string[]): Promise<{ exitCode: number; lines: string[] }> => {
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    return { exitCode: await checkPlaceholders(args), lines }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('un progetto che tiene i propri dati fuori dai moduli del template', () => {
  const declared = config(
    "{ placeholders: { sources: ['src/lib/site.ts'], contactEnvKeys: ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME'] } }",
  )

  it('esce 0 con un verdetto, senza pretendere company.ts', async () => {
    const root = project({
      'officina.config.mjs': declared,
      'src/lib/site.ts': "export const SITE = { url: 'https://acme.test' }\n",
    })

    const { exitCode, lines } = await run(root, [])

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain('1 sorgenti')
    expect(lines.join('\n')).toContain('Nessun segnaposto del template.')
  })

  it('con --env non pretende una variabile che quel progetto non usa', async () => {
    const root = project({
      'officina.config.mjs': declared,
      'src/lib/site.ts': "export const SITE = { url: 'https://acme.test' }\n",
      '.env.production.local': 'CONTACT_FROM_EMAIL="hello@acme.test"\nCONTACT_FROM_NAME="Acme"\n',
    })

    const { exitCode, lines } = await run(root, ['--env', '.env.production.local'])

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).not.toContain('CONTACT_TO_EMAIL')
  })
})

describe('un sorgente che non esiste', () => {
  it('esce 1 elencandolo, invece di sollevare, e guarda comunque gli altri', async () => {
    const root = project({
      'officina.config.mjs': config("{ placeholders: { sources: ['src/lib/assente.ts', 'src/lib/site.ts'] } }"),
      'src/lib/site.ts': "export const SITE = { url: 'https://example.com' }\n",
    })

    const { exitCode, lines } = await run(root, [])

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('src/lib/assente.ts: sorgente assente')
    expect(lines.join('\n')).toContain('dominio segnaposto example.com')
  })
})
