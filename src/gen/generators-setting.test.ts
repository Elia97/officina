import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PROJECT_GENERATORS } from './plopfile.mjs'
import { main as gen } from './run.ts'

const original = process.cwd()
const roots: string[] = []

function project(setting: string, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-generatori-'))
  roots.push(root)
  writeFileSync(join(root, 'officina.config.mjs'), `export default { features: { generators: ${setting} } }\n`)
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source)
  process.chdir(root)
  return root
}

const run = async (): Promise<{ exitCode: number; said: string }> => {
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    return { exitCode: await gen([]), said: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => {
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('officina gen quando il progetto ha spento i generatori', () => {
  it('con false non lancia niente e dice perché', async () => {
    project('false')

    const { exitCode, said } = await run()

    expect(exitCode).toBe(1)
    expect(said).toContain('`features.generators: false`')
  })

  it("con 'project' pretende il file da cui carica i suoi", async () => {
    project("'project'")

    const { exitCode, said } = await run()

    expect(exitCode).toBe(1)
    expect(said).toContain(PROJECT_GENERATORS)
  })
})
