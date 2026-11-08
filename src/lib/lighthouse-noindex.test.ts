import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { noindexInBuild, noindexOnSite, outOfIndex } from './lighthouse-noindex.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const page = (meta: string): string => `<!doctype html><html><head>${meta}<title>x</title></head></html>`

describe('outOfIndex', () => {
  it.each([
    ['<meta name="robots" content="noindex, nofollow">', true],
    ['<meta content="noindex" name="robots" />', true],
    ["<META NAME='Robots' CONTENT='none'>", true],
    ['<meta name="robots" content="index, follow">', false],
    ['<meta name="robots-extra" content="noindex">', false],
    ['<meta name="robots">', false],
    ['<meta name="description" content="noindex">', false],
    ['', false],
  ])('%s → %s', (meta, expected) => {
    expect(outOfIndex(page(meta))).toBe(expected)
  })

  it("legge anche l'header X-Robots-Tag", () => {
    expect(outOfIndex(page(''), 'noindex')).toBe(true)
    expect(outOfIndex(page(''), 'max-snippet:50')).toBe(false)
  })
})

describe('noindexInBuild', () => {
  it('trova le pagine in noindex nelle due forme di build, e tiene indicizzabile quella che manca', () => {
    const dir = mkdtempSync(join(tmpdir(), 'officina-noindex-'))
    roots.push(dir)
    const files = {
      'index.html': page(''),
      'en/terms/index.html': page('<meta name="robots" content="noindex, nofollow">'),
      'privacy.html': page('<meta name="robots" content="noindex">'),
    }
    for (const [name, html] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, name)), { recursive: true })
      writeFileSync(join(dir, name), html)
    }

    expect(noindexInBuild(dir, ['/', '/en/terms', '/privacy', '/news/ciao'])).toEqual(
      new Set(['/en/terms', '/privacy']),
    )
  })
})

describe('noindexOnSite', () => {
  it('legge meta e header della risposta, e tiene indicizzabile la pagina che non risponde', async () => {
    const responses: Record<string, () => Promise<Response>> = {
      'https://acme.test/': async () => new Response(page('')),
      'https://acme.test/terms': async () => new Response(page('<meta name="robots" content="noindex">')),
      'https://acme.test/area': async () => new Response(page(''), { headers: { 'X-Robots-Tag': 'noindex' } }),
      'https://acme.test/rotta': async () =>
        new Response(page('<meta name="robots" content="noindex">'), { status: 404 }),
      'https://acme.test/giu': async () => Promise.reject(new TypeError('fetch failed')),
    }
    const fetchPage = (url: string) => (responses[url] ?? (() => Promise.reject(new Error(url))))()

    const routes = ['/', '/terms', '/area', '/rotta', '/giu']
    expect(await noindexOnSite('https://acme.test', routes, fetchPage)).toEqual(new Set(['/terms', '/area']))
  })
})
