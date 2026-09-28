import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkLanguage } from './language.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('check:language su un progetto con i contenuti in due lingue', () => {
  it('lascia fuori un articolo inglese di src/content/ e segna lo stesso testo in docs/', () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-language-'))
    roots.push(root)
    const article = '---\ntitle: Market\n---\n\nThe members are invited to the market, and they will open it.\n'
    mkdirSync(join(root, 'src/content/news/en'), { recursive: true })
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'src/content/news/en/market.md'), article)
    writeFileSync(join(root, 'docs/market.md'), article)
    // trackedAndUntracked (src/lib/git.ts) muore con «fatal: not a git repository» fuori da un repository.
    spawnSync('git', ['init', '--quiet'], { cwd: root })
    process.chdir(root)

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))

    expect(checkLanguage([])).toBe(1)
    expect(lines.join('\n')).toContain('docs/market.md')
    expect(lines.join('\n')).not.toContain('src/content/')
  })
})
