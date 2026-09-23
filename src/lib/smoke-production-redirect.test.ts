import { describe, expect, it, vi } from 'vitest'

import { checkSecurityHeaders, type Fetcher, waitForAlias } from './smoke-production.ts'
import {
  always,
  context,
  type ResponseInit,
  response,
  SITE_URL,
  secureHeaders,
  statuses,
} from './test-helpers/smoke-fetch.ts'

const byUrl =
  (routes: Record<string, ResponseInit>): Fetcher =>
  (url) =>
    Promise.resolve(response(routes[url] ?? { status: 404 }))

const localeRedirect = (home: ResponseInit, location = '/it') =>
  vi.fn(
    byUrl({
      [SITE_URL]: { ok: false, status: 302, headers: { location } },
      [`${SITE_URL}/it`]: home,
    }),
  )

describe('con la radice che rimanda alla lingua, come il 302 di i18n di Astro', () => {
  it('checkSecurityHeaders legge gli header sulla pagina d’arrivo e lo dice nel nome del controllo', async () => {
    const get = localeRedirect({ headers: secureHeaders() })

    const results = await checkSecurityHeaders(context(get))

    expect(statuses(results)).toEqual(results.map(() => 'pass'))
    expect(results[0]?.check).toBe('header content-security-policy su /it')
    expect(get).toHaveBeenLastCalledWith(`${SITE_URL}/it`)
  })

  it('boccia la CSP che manca sulla pagina d’arrivo, non quella che manca sul redirect', async () => {
    const headers = secureHeaders()
    delete headers['content-security-policy']

    const results = await checkSecurityHeaders(context(localeRedirect({ headers })))

    expect(results.filter(({ status }) => status === 'fail')).toEqual([
      { check: 'header content-security-policy su /it', status: 'fail', detail: 'assente' },
    ])
  })

  it('segue anche una location assoluta sulla stessa origine', async () => {
    const results = await checkSecurityHeaders(context(localeRedirect({ headers: secureHeaders() }, `${SITE_URL}/it`)))

    expect(statuses(results)).toEqual(results.map(() => 'pass'))
  })

  it('nomina la pagina d’arrivo quando lì c’è un x-robots-tag', async () => {
    const results = await checkSecurityHeaders(
      context(localeRedirect({ headers: { ...secureHeaders(), 'x-robots-tag': 'noindex' } })),
    )

    expect(results.at(-1)?.detail).toBe(`presente su ${SITE_URL}/it: "noindex"`)
  })

  it('waitForAlias conta il redirect come una risposta, e non consuma i tentativi', async () => {
    const get = localeRedirect({ headers: secureHeaders() })
    const sleep = vi.fn(() => Promise.resolve())

    await waitForAlias(context(get), sleep)

    expect(get).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})

describe('un redirect che non porta a una pagina della stessa origine', () => {
  it.each([
    [
      'verso un’altra origine',
      { location: 'https://altrove.test/it' },
      /rimanda a https:\/\/altrove\.test\/it, fuori da/,
    ],
    ['senza location', {}, /risponde 302 senza location/],
  ])('%s è un fallimento solo, con il motivo', async (_case, headers, detail) => {
    const results = await checkSecurityHeaders(context(byUrl({ [SITE_URL]: { status: 302, headers } })))

    expect(results).toEqual([{ check: 'header di sicurezza', status: 'fail', detail: expect.stringMatching(detail) }])
  })

  it('smette di seguire un giro di redirect', async () => {
    const get = vi.fn(always({ status: 307, headers: { location: '/' } }))

    const results = await checkSecurityHeaders(context(get))

    expect(results).toEqual([
      { check: 'header di sicurezza', status: 'fail', detail: `più di 5 redirect a partire da ${SITE_URL}` },
    ])
    expect(get).toHaveBeenCalledTimes(6)
  })
})
