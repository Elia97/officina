import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as doctor } from './doctor.ts'

vi.mock('../lib/tooling.ts', () => ({
  toolingGaps: () => [{ path: 'package.json', message: 'un requisito nuovo', severity: 'warning' }],
}))

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('doctor e i requisiti che nascono come avviso', () => {
  it('stampa come avviso, non come errore, una mancanza che porta severity warning', async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-doctor-avvisi-'))
    roots.push(root)
    // trackedAndUntracked (src/lib/git.ts) muore con «fatal: not a git repository» fuori da un repository.
    spawnSync('git', ['init', '--quiet'], { cwd: root })
    process.chdir(root)

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    await doctor()

    expect(lines.join('\n')).toContain('· package.json: un requisito nuovo')
    expect(lines.join('\n')).not.toContain('✗ package.json: un requisito nuovo')
  })
})
