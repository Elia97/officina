import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BIOME_PRESET } from '../lib/alignment.ts'
import { main as doctor } from './doctor.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('doctor e i requisiti che nascono come avviso', () => {
  it('stampa lo schema di Biome con la versione come avviso, non come errore', async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-doctor-avvisi-'))
    roots.push(root)
    const schema = 'https://biomejs.dev/schemas/2.5.10/schema.json'
    writeFileSync(join(root, 'biome.json'), `{ "$schema": "${schema}", "extends": ["${BIOME_PRESET}"] }\n`)
    // trackedAndUntracked (src/lib/git.ts) muore con «fatal: not a git repository» fuori da un repository.
    spawnSync('git', ['init', '--quiet'], { cwd: root })
    process.chdir(root)

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    await doctor()

    expect(lines.join('\n')).toContain('· biome.json: `$schema` porta la versione di Biome')
    expect(lines.join('\n')).not.toContain('✗ biome.json')
  })
})
