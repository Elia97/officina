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

const PROMOTE = [
  'La produzione è online e rotta. Torna indietro dalla dashboard di Vercel:',
  'Deployments → l’ultimo deployment di produzione sano → Promote to Production.\n',
]

const SCHEMA = [
  'Con un database lo schema non torna indietro: le migrazioni già applicate restano,',
  'e il deployment che promuovi regge solo se sono compatibili con il suo codice.',
  'La regola è nel README di officina: «Migrazioni compatibili con la produzione».\n',
]

const config = (extra: object = {}) => `export default ${JSON.stringify({ siteUrl: 'https://prova.test', ...extra })}\n`

const manifest = (dependencies: Record<string, string>) => `${JSON.stringify({ dependencies })}\n`

async function failedSmoke(files: Record<string, string>): Promise<string[]> {
  const root = mkdtempSync(join(tmpdir(), 'officina-smoke-rollback-'))
  roots.push(root)
  for (const [name, source] of Object.entries({ 'src/pages/index.astro': '<h1>Casa</h1>\n', ...files })) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  process.chdir(root)
  vi.stubGlobal('fetch', async () => new Response('', { status: 200, headers: { 'content-type': 'text/html' } }))
  vi.spyOn(console, 'log').mockImplementation(() => {})
  const lines: string[] = []
  vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
  expect(await checkSmoke()).toBe(1)
  return lines
}

describe('check smoke fallito e il ritorno al deployment precedente', () => {
  it('senza database consiglia la promozione, con il messaggio di prima', async () => {
    const lines = await failedSmoke({ 'officina.config.mjs': config(), 'package.json': manifest({ astro: '6.0.0' }) })
    expect(lines.slice(-2)).toEqual(PROMOTE)
  })

  it('con features.database accesa aggiunge che lo schema non torna indietro', async () => {
    const lines = await failedSmoke({ 'officina.config.mjs': config({ features: { database: 'required' } }) })
    expect(lines.slice(-5)).toEqual([...PROMOTE, ...SCHEMA])
  })

  it('senza dichiarazione segue drizzle-orm fra le dipendenze di package.json', async () => {
    const files = { 'officina.config.mjs': config(), 'package.json': manifest({ 'drizzle-orm': '0.45.0' }) }
    expect((await failedSmoke(files)).slice(-5)).toEqual([...PROMOTE, ...SCHEMA])
  })
})
