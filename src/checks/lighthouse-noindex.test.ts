import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkLighthouse } from './lighthouse.ts'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const RC = {
  ci: {
    collect: {},
    assert: {
      assertions: {
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
  },
}

const NOINDEX = '<html><head><meta name="robots" content="noindex, nofollow"></head></html>'

function project(files: Record<string, string>): void {
  const root = mkdtempSync(join(tmpdir(), 'officina-lighthouse-noindex-'))
  roots.push(root)
  const all = {
    '.lighthouserc.json': JSON.stringify(RC),
    'src/pages/index.astro': '<h1>Casa</h1>\n',
    'src/pages/en/terms.astro': '<h1>Terms</h1>\n',
    ...files,
  }
  for (const [name, source] of Object.entries(all)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  process.chdir(root)
}

function run(): { lines: string[]; config: () => unknown } {
  let written: unknown
  vi.mocked(spawnSync).mockImplementation(((_: string, args: readonly string[]) => {
    const path = args.find((arg) => arg.startsWith('--config='))?.slice('--config='.length) ?? ''
    written = JSON.parse(readFileSync(path, 'utf8'))
    return { status: 0 }
  }) as unknown as typeof spawnSync)
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
  return { lines, config: () => written }
}

describe('check lighthouse e le pagine in noindex', () => {
  it("le misura, senza l'asserzione sul SEO, e lo dice", async () => {
    project({ 'dist/client/index.html': '<html></html>', 'dist/client/en/terms/index.html': NOINDEX })
    const { lines, config } = run()

    expect(await checkLighthouse()).toBe(0)
    expect(lines).toContain("  http://localhost:4321/en/terms — noindex: misurata, senza l'asserzione sul SEO")
    expect(lines).toContain('  http://localhost:4321/')
    const { assertMatrix } = (config() as { ci: { assert: { assertMatrix: { matchingUrlPattern?: string }[] } } }).ci
      .assert
    expect(assertMatrix.at(-1)?.matchingUrlPattern).toBe('^(?!(?:http://localhost:4321/en/terms)/?$)')
  })

  it('senza la build asserisce il SEO ovunque, e lo dice', async () => {
    project({})
    const { lines, config } = run()

    expect(await checkLighthouse()).toBe(0)
    expect(lines.join('\n')).toContain("NOTA  dist/client non c'è: le pagine in noindex non si riconoscono")
    expect((config() as typeof RC).ci.assert).toEqual(RC.ci.assert)
  })
})
