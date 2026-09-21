import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as doctor } from './doctor.ts'

const original = process.cwd()
const roots: string[] = []

function project(setting: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-doctor-'))
  roots.push(root)
  writeFileSync(join(root, 'officina.config.mjs'), `export default { features: { generators: ${setting} } }\n`)
  // trackedAndUntracked (src/lib/git.ts) muore con «fatal: not a git repository» fuori da un repository.
  spawnSync('git', ['init', '--quiet'], { cwd: root })
  process.chdir(root)
  return root
}

const run = async (): Promise<string> => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    await doctor()
    return lines.join('\n')
  } finally {
    vi.restoreAllMocks()
  }
}

afterEach(() => {
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('doctor e i generatori spenti', () => {
  it('con false non nomina nessun aggancio, e le due sezioni si leggono come spente', async () => {
    project('false')

    const said = await run()

    expect(said).toContain('· punti di aggancio dei generatori — spento da `features.generators: false`')
    expect(said).toContain(
      '· ancoraggi delle pagine a sezioni e dei dizionari — spento da `features.generators: false`',
    )
    expect(said).not.toContain('section.astro')
    expect(said).not.toContain('src/i18n/translate.ts')
  })

  it("con 'project' resta solo la domanda su officina.generators.mjs", async () => {
    project("'project'")

    const said = await run()

    expect(said).toContain('officina.generators.mjs')
    expect(said).toContain(
      "· ancoraggi delle pagine a sezioni e dei dizionari — spento da `features.generators: 'project'`",
    )
  })
})
