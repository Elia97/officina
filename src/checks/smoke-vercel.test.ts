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
const VERCEL = 'https://prova.vercel.app'

const HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  ...Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([header, value]) => [header, value ?? 'presente'])),
}

const moved = (location: string) => new Response(null, { status: 308, headers: { location } })

const edge = (asked: string[]) => async (url: string) => {
  asked.push(url)
  const { host, pathname } = new URL(url)
  if (host === 'www.prova.test') return moved(`${SITE}/`)
  if (pathname !== '/' && pathname.endsWith('/')) return moved(url.slice(0, -1))
  const robots = host.endsWith('.vercel.app') ? { 'x-robots-tag': 'noindex, nofollow' } : {}
  return new Response('', { status: 200, headers: { ...HEADERS, ...robots } })
}

async function smoke(declared: object, args: string[] = [], siteUrl = SITE) {
  const root = mkdtempSync(join(tmpdir(), 'officina-smoke-vercel-'))
  roots.push(root)
  const config = { siteUrl, features: { botId: false }, smoke: { nonHtmlRoutes: [], ...declared } }
  const files = {
    'officina.config.mjs': `export default ${JSON.stringify(config)}\n`,
    'src/pages/index.astro': '<h1>Casa</h1>\n',
    'src/pages/chi-siamo.astro': '<h1>Chi siamo</h1>\n',
  }
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  process.chdir(root)
  const asked: string[] = []
  vi.stubGlobal('fetch', edge(asked))
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
  const status = await checkSmoke(args)
  return { status, hosts: new Set(asked.map((url) => new URL(url).host)), lines }
}

describe('check smoke e il dominio che non serve ancora la produzione', () => {
  it('senza smoke.url prova siteUrl, e lì il noindex non deve esserci', async () => {
    const { status, hosts, lines } = await smoke({})

    expect(status).toBe(0)
    expect(hosts).toEqual(new Set(['prova.test', 'www.prova.test']))
    expect(lines).toContain('✓ nessun x-robots-tag sull’host di produzione')
  })

  it("con smoke.url prova l'indirizzo di Vercel, dove il noindex deve esserci", async () => {
    const { status, hosts, lines } = await smoke({ url: VERCEL })

    expect(status).toBe(0)
    expect(hosts).toEqual(new Set(['prova.vercel.app']))
    expect(lines).toContain('✓ x-robots-tag noindex sull’indirizzo di Vercel')
    expect(lines).toContain(`- www → apice 308 (saltato: l’URL di base non è ${SITE})`)
    expect(lines.join('\n')).toContain(`da smoke.url, al posto di ${SITE}: con il dominio la voce esce`)
  })

  it('un URL passato a mano vince su smoke.url', async () => {
    const { status, hosts, lines } = await smoke({ url: VERCEL }, [SITE])

    expect(status).toBe(0)
    expect(hosts).toEqual(new Set(['prova.test', 'www.prova.test']))
    expect(lines.join('\n')).not.toContain('da smoke.url')
  })

  it('senza smoke.url il segnaposto di siteUrl ferma lo smoke prima di ogni richiesta', async () => {
    const { status, hosts, lines } = await smoke({}, [], 'https://example.com')

    expect(status).toBe(1)
    expect(hosts).toEqual(new Set())
    expect(lines.join('\n')).toContain('siteUrl è ancora il segnaposto del template')
  })

  it('con smoke.url il segnaposto di siteUrl non ferma lo smoke, perché non è lui che si prova', async () => {
    const { status, hosts } = await smoke({ url: VERCEL }, [], 'https://example.com')

    expect(status).toBe(0)
    expect(hosts).toEqual(new Set(['prova.vercel.app']))
  })
})
