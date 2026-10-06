import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as doctor } from './doctor.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

async function doctorInRepository(files: Record<string, string>): Promise<{ said: string; code: number }> {
  const root = mkdtempSync(join(tmpdir(), 'officina-doctor-database-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source)
  spawnSync('git', ['init', '--quiet'], { cwd: root })
  process.chdir(root)

  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
  const code = await doctor()
  vi.restoreAllMocks()
  return { said: lines.join('\n'), code }
}

const errors = (said: string) => said.split('\n').filter((line) => line.includes('✗')).length

const manifest = (dependencies: Record<string, string>) => JSON.stringify({ dependencies })
const DRIZZLE = { 'drizzle-orm': '^0.45.2' }
const BETTER_AUTH = { 'better-auth': '^1.7.3' }
const DATABASE_OFF = 'export default { features: { database: false } }\n'

describe('doctor con un database e l’autenticazione', () => {
  it('senza le due librerie non mostra la sezione', async () => {
    const { said } = await doctorInRepository({ 'package.json': manifest({}) })

    expect(said).not.toContain('database e autenticazione')
  })

  it('con le due librerie e nient’altro elenca le mancanze come avvisi', async () => {
    const { said } = await doctorInRepository({ 'package.json': manifest({ ...DRIZZLE, ...BETTER_AUTH }) })

    expect(said).toContain('  database e autenticazione: 4')
    expect(said).toContain('· package.json: script `db:migrate` assente')
    expect(said).toContain('· drizzle.config.ts: manca')
    expect(said).toContain('· astro.config.mjs: manca')
    expect(said).not.toMatch(/✗ (drizzle\.config\.ts|astro\.config\.mjs)/)
  })

  it('le sue mancanze non aggiungono errori: doctor esce come senza le due librerie', async () => {
    const without = await doctorInRepository({ 'package.json': manifest({}) })
    const withLibraries = await doctorInRepository({ 'package.json': manifest({ ...DRIZZLE, ...BETTER_AUTH }) })

    expect(errors(withLibraries.said)).toBe(errors(without.said))
    expect(withLibraries.code).toBe(without.code)
  })

  it('con features.database: false non chiede il database, e lo dice', async () => {
    const { said } = await doctorInRepository({
      'package.json': manifest(DRIZZLE),
      'officina.config.mjs': DATABASE_OFF,
    })

    expect(said).toContain('  · database e autenticazione — spento da `features.database: false`')
    expect(said).not.toContain('drizzle.config.ts')
  })

  it('con una feature spenta e l’altra accesa elenca le mancanze della seconda e nota la prima', async () => {
    const { said } = await doctorInRepository({
      'package.json': manifest({ ...DRIZZLE, ...BETTER_AUTH }),
      'officina.config.mjs': DATABASE_OFF,
    })

    expect(said).toContain('  database e autenticazione: 1')
    expect(said).toContain('    · spenta da `features.database: false`')
  })
})
