import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkSmoke } from './smoke.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const CONFIG = `export default {
  siteUrl: 'https://prova.test',
  routes: { representatives: { '/news/[slug]': '/news/ciao' }, disabled: ['/news/[slug]'] },
}
`

const FILES = {
  'officina.config.mjs': CONFIG,
  'src/pages/index.astro': '<h1>Casa</h1>\n',
  'src/pages/news/[slug].astro': '<h1>Articolo</h1>\n',
}

describe('check smoke e una pagina dinamica spenta per scelta', () => {
  it("non visita il suo rappresentante, anche se c'è ancora, e lo dice", async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-smoke-spente-'))
    roots.push(root)
    for (const [name, source] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), source)
    }
    process.chdir(root)

    const asked: string[] = []
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url)
      return new Response('', { status: 200, headers: { 'content-type': 'text/html' } })
    })
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await checkSmoke()

    expect(asked).toContain('https://prova.test/')
    expect(asked).not.toContain('https://prova.test/news/ciao')
    expect(lines).toContain('- pagina /news/[slug] (saltato: spenta da `routes.disabled`)')
  })
})
