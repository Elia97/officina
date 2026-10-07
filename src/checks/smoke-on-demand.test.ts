import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SECURITY_HEADERS } from '../lib/smoke-production.ts'
import { main as checkSmoke } from './smoke.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const SITE = 'https://prova.test'

const FILES = {
  'officina.config.mjs': `export default { siteUrl: '${SITE}', features: { botId: false }, smoke: { nonHtmlRoutes: [] } }\n`,
  'src/pages/index.astro': '<h1>Casa</h1>\n',
  'src/pages/chi-siamo.astro': '<h1>Chi siamo</h1>\n',
  'src/pages/accedi.astro': '---\nexport const prerender = false\n---\n<h1>Accedi</h1>\n',
}

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  ...Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([header, value]) => [header, value ?? 'presente'])),
}

const moved = (location: string) => new Response(null, { status: 308, headers: { location } })

const edgeWithoutCsp = (asked: string[]) => async (url: string) => {
  asked.push(url)
  const { host, pathname } = new URL(url)
  if (host === 'www.prova.test') return moved(`${SITE}/`)
  if (pathname !== '/' && pathname.endsWith('/')) return moved(url.slice(0, -1))
  return new Response('<html><head><meta charset="utf-8"></head></html>', { status: 200, headers: HEADERS })
}

describe('check smoke e una pagina resa a richiesta', () => {
  it('la visita, e senza la CSP la segnala con un avviso che non fa fallire lo smoke', async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-smoke-richiesta-'))
    roots.push(root)
    for (const [name, source] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), source)
    }
    process.chdir(root)
    const asked: string[] = []
    vi.stubGlobal('fetch', edgeWithoutCsp(asked))
    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await checkSmoke()).toBe(0)
    expect(lines).toContain('· GET /accedi (a richiesta) — manca il meta Content-Security-Policy con script-src')
    expect(lines).toContain('\n· 1 avviso/i: dalla 0.13.0 fanno fallire lo smoke.')
    expect(asked).toContain(`${SITE}/chi-siamo/`)
    expect(asked).not.toContain(`${SITE}/accedi/`)
  })
})
