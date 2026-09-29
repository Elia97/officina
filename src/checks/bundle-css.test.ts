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

const MAIN = 'body { margin: 0; font-family: system-ui, sans-serif; color: #222 }\n'
const SLUG = 'article h2 { font-size: 2rem; letter-spacing: -0.01em }\n'
const BOTH = gzipSync(MAIN).length + gzipSync(SLUG).length

const link = (file: string) => `<link rel="stylesheet" href="/_astro/${file}">`
const config = (cssMaxGzip: number) => `export default { bundle: { cssMaxGzip: ${cssMaxGzip} } }\n`

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-css-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  return root
}

const blog = (cssMaxGzip: number) =>
  project({
    'officina.config.mjs': config(cssMaxGzip),
    'src/pages/index.astro': '<h1>Casa</h1>\n',
    'src/pages/blog/[slug].astro': '<h1>Articolo</h1>\n',
    'dist/client/_astro/main.css': MAIN,
    'dist/client/_astro/slug.css': SLUG,
    'dist/client/index.html': link('main.css'),
    'dist/client/blog/uno/index.html': `${link('main.css')}${link('slug.css')}`,
  })

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

describe('il CSS di una pagina che collega due fogli', () => {
  it('pesa la somma dei due, anche se ognuno sta nel tetto', async () => {
    const { exitCode, said } = await run(blog(BOTH - 1))

    expect(exitCode).toBe(1)
    expect(said).toContain('/blog/uno: CSS')
    expect(said).toContain('main.css + slug.css, su 1 rotta')
  })

  it('passa quando la somma sta nel tetto, con una riga per combinazione di fogli', async () => {
    const { exitCode, said } = await run(blog(BOTH))

    expect(exitCode).toBe(0)
    expect(said).toMatch(/^ {2}main\.css \+ slug\.css +.+ 1 rotta$/m)
    expect(said).toMatch(/^ {2}main\.css {2,}\S.* 1 rotta$/m)
  })
})

describe('una build ibrida le cui rotte SSR non si leggono', () => {
  it('pesa da solo il foglio che solo quelle rotte collegano, e fallisce oltre il tetto', async () => {
    const heavy = gzipSync(SLUG).length
    const { exitCode, said } = await run(
      project({
        'officina.config.mjs': config(heavy - 1),
        'src/pages/index.astro': '<h1>Casa</h1>\n',
        'src/pages/app.astro': '---\nexport const prerender = false\n---\n<h1>App</h1>\n',
        'dist/client/_astro/slug.css': SLUG,
        'dist/client/index.html': '<h1>Casa</h1>\n',
        'dist/server/entry.mjs': 'export {}\n',
      }),
    )

    expect(exitCode).toBe(1)
    expect(said).toMatch(/^ {2}slug\.css .+ da solo {2}✗$/m)
    expect(said).toContain('slug.css: CSS')
    expect(said).toContain('pesato da solo: nessuna rotta misurata lo collega')
  })
})
