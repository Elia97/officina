import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkBundle } from './bundle.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const SCRIPT = `export const values = ${JSON.stringify(Array.from({ length: 400 }, (_, i) => (i * 7919) % 10007))}\n`
const WEIGHT = `${(gzipSync(SCRIPT).length / 1024).toFixed(1)} KB`

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-base-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  return root
}

async function run(root: string): Promise<{ exitCode: number; said: string }> {
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  const keep = (line: string) => {
    lines.push(line)
  }
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(console, 'log').mockImplementation(keep)
  try {
    return { exitCode: await checkBundle(), said: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

describe('una pagina sotto una base, con la query della skew protection', () => {
  it('pesa il suo script e collega il suo foglio, invece di pesare zero', async () => {
    const { exitCode, said } = await run(
      project({
        'officina.config.mjs': 'export default {}\n',
        'src/pages/index.astro': '<h1>Casa</h1>\n',
        'dist/client/_astro/page.js': SCRIPT,
        'dist/client/_astro/main.css': 'body { margin: 0 }\n',
        'dist/client/index.html':
          '<link rel="stylesheet" href="/sub/_astro/main.css?dpl=dpl_1">' +
          '<script type="module" src="/sub/_astro/page.js?dpl=dpl_1"></script>',
      }),
    )

    expect(exitCode).toBe(0)
    expect(WEIGHT).not.toBe('0.0 KB')
    expect(said).toMatch(new RegExp(`^/ +${WEIGHT.replace('.', '\\.')}`, 'm'))
    expect(said).toMatch(/^ {2}main\.css .+ 1 rotta$/m)
  })
})
