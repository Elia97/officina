import { describe, expect, it, vi } from 'vitest'

import type { Expectations } from './routes.ts'
import { checkOnDemandPages, type OnDemandPage, onDemandPages } from './smoke-on-demand.ts'
import type { Fetcher, SmokeResponse } from './smoke-production.ts'
import { context, type ResponseInit, response, SITE_URL } from './test-helpers/smoke-fetch.ts'

const expected = (ssr: string[]): Expectations => ({ exact: [], patterns: [], disabled: [], ssr })

describe('onDemandPages', () => {
  it('ricava le rotte dai file, in ordine, e dà a un pattern il suo rappresentante', () => {
    const ssr = [
      'src/pages/pannello/index.astro',
      'src/pages/ordini/[id].astro',
      'src/pages/accedi.astro',
      'src/pages/carrello/[step].astro',
    ]

    expect(onDemandPages(expected(ssr), 'src/pages', { '/ordini/[id]': '/ordini/1' })).toEqual([
      { label: '/accedi', path: '/accedi' },
      { label: '/carrello/[step]' },
      { label: '/ordini/[id]', path: '/ordini/1' },
      { label: '/pannello', path: '/pannello' },
    ])
  })
})

const ACCEDI: OnDemandPage[] = [{ label: '/accedi', path: '/accedi' }]
const CHECK = 'GET /accedi (a richiesta)'
const HTML = { 'content-type': 'text/html; charset=utf-8' }

const run = (get: Fetcher, onDemand: OnDemandPage[] = ACCEDI) => checkOnDemandPages({ ...context(get), onDemand })
const answer = (init: ResponseInit): Fetcher => vi.fn(() => Promise.resolve(response(init)))
const page = (head: string) =>
  `<!doctype html><html><head><meta charset="utf-8">${head}<title>Accedi</title></head></html>`

describe('checkOnDemandPages: il meta della CSP', () => {
  it.each([
    [
      'fra virgolette doppie',
      `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'">`,
    ],
    [
      'con gli attributi in un altro ordine, in maiuscolo',
      `<META CONTENT="script-src 'self'" HTTP-EQUIV="content-security-policy">`,
    ],
    ['fra apici singoli', "<meta http-equiv='Content-Security-Policy' content='script-src https://cdn.test'>"],
    ['senza virgolette', `<meta http-equiv=Content-Security-Policy content="script-src 'self'">`],
  ])('un 200 HTML con il meta %s passa', async (_, head) => {
    expect(await run(answer({ headers: HTML, body: page(head) }))).toEqual([{ check: CHECK, status: 'pass' }])
  })

  it.each([
    ['senza il meta', page('')],
    [
      'con un meta senza script-src',
      page(`<meta http-equiv="Content-Security-Policy" content="script-src-elem 'self'">`),
    ],
    ['con script-src in un meta che non è la CSP', page('<meta name="description" content="script-src">')],
  ])('un 200 HTML %s è un avviso', async (_, body) => {
    const detail = 'manca il meta Content-Security-Policy con script-src'

    expect(await run(answer({ headers: HTML, body }))).toEqual([{ check: CHECK, status: 'warn', detail }])
  })

  it('una risposta senza un corpo da leggere non porta il meta', async () => {
    const bare: SmokeResponse = { ok: true, status: 200, headers: { get: () => 'text/html' } }

    expect(await run(() => Promise.resolve(bare))).toMatchObject([{ status: 'warn' }])
  })
})

describe('checkOnDemandPages: stati e redirect', () => {
  it.each([
    ['assoluto', `${SITE_URL}/accedi?next=/pannello`],
    ['relativo', '/accedi?next=/pannello'],
  ])("un redirect %s sulla stessa origine passa: una pagina protetta rimanda all'accesso", async (_, location) => {
    const pannello = [{ label: '/pannello', path: '/pannello' }]

    expect(await run(answer({ status: 302, headers: { location } }), pannello)).toEqual([
      { check: 'GET /pannello (a richiesta)', status: 'pass' },
    ])
  })

  it.each([
    [
      "un redirect verso un'altra origine",
      { status: 302, headers: { location: 'https://altro.test/login' } },
      `rimanda a https://altro.test/login, fuori da ${SITE_URL}`,
    ],
    ['un redirect senza location', { status: 302 }, 'risponde 302 senza location'],
    ['un 500', { status: 500 }, 'atteso 200 o un redirect sulla stessa origine, ricevuto 500'],
    [
      'un 200 JSON',
      { headers: { 'content-type': 'application/json' } },
      'atteso un content-type text/html, ricevuto "application/json"',
    ],
    ['un 200 senza content-type', {}, 'atteso un content-type text/html, ricevuto ""'],
  ])('%s è un avviso', async (_, init: ResponseInit, detail) => {
    expect(await run(answer(init))).toEqual([{ check: CHECK, status: 'warn', detail }])
  })

  it.each([
    ['un Error', new Error('ECONNRESET'), 'ECONNRESET'],
    ['un valore qualunque', 'timeout', 'timeout'],
  ])('un errore di rete, %s, è un avviso', async (_, error, detail) => {
    expect(await run(() => Promise.reject(error))).toEqual([{ check: CHECK, status: 'warn', detail }])
  })
})

describe('checkOnDemandPages: le pagine da visitare', () => {
  it('salta un pattern senza rappresentante, e lo dice, senza nessuna richiesta', async () => {
    const get = answer({ headers: HTML })
    const detail = 'pagina dinamica senza rappresentante in `routes.representatives`'

    expect(await run(get, [{ label: '/ordini/[id]' }])).toEqual([
      { check: 'pagina /ordini/[id] (a richiesta)', status: 'skip', detail },
    ])
    expect(get).not.toHaveBeenCalled()
  })

  it('senza pagine a richiesta non dà risultati', async () => {
    expect(await checkOnDemandPages(context(answer({ headers: HTML })))).toEqual([])
  })
})
