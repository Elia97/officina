import { describe, expect, it, vi } from 'vitest'
import {
  BOTID_CHALLENGE,
  checkBotIdChallenge,
  checkCanonicalHost,
  checkTrailingSlash,
  runChecks,
  SECURITY_HEADERS,
} from './smoke-production.ts'
import { always, context, SITE_URL, secureHeaders, statuses } from './test-helpers/smoke-fetch.ts'
import { PAGES } from './test-helpers/smoke-pages.ts'

describe('checkBotIdChallenge', () => {
  it('passes when the same-origin rewrite serves the challenge', async () => {
    const get = vi.fn(always({}))

    expect(statuses(await checkBotIdChallenge(context(get)))).toEqual(['pass'])
    expect(get).toHaveBeenCalledWith(`${SITE_URL}${BOTID_CHALLENGE}`)
  })

  it('fails when the rewrite is not in place', async () => {
    const [result] = await checkBotIdChallenge(context(always({ status: 404 })))

    expect(result?.status).toBe('fail')
    expect(result?.detail).toMatch(/atteso 200 dal rewrite/)
  })

  it('reports a network error', async () => {
    const [result] = await checkBotIdChallenge(context(() => Promise.reject(new Error('EAI_AGAIN'))))

    expect(result).toMatchObject({ status: 'fail', detail: 'EAI_AGAIN' })
  })
  it('skips without a request when the project declares `features.botId: false`', async () => {
    const get = vi.fn(always({}))

    const [result] = await checkBotIdChallenge({ ...context(get), botIdRequired: false })

    expect(result).toMatchObject({ status: 'skip', detail: 'spento da `features.botId: false`' })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('checkCanonicalHost', () => {
  it('skips without making a request when the base URL is not the production site', async () => {
    const get = vi.fn(always({}))

    const [result] = await checkCanonicalHost(context(get, 'https://preview.vercel.app'))

    expect(result).toMatchObject({ status: 'skip' })
    expect(get).not.toHaveBeenCalled()
  })

  it('passes on a 308 whose location points at the apex', async () => {
    const get = vi.fn(always({ status: 308, headers: { location: `${SITE_URL}/` } }))

    expect(statuses(await checkCanonicalHost(context(get)))).toEqual(['pass'])
    expect(get).toHaveBeenCalledWith('https://www.example.test/')
  })

  it.each([
    [{ status: 200, headers: { location: `${SITE_URL}/` } }, /atteso 308, ricevuto 200/],
    [{ status: 308, headers: { location: 'https://elsewhere.test/' } }, /non punta a/],
    [{ status: 308, headers: {} }, /location ""/],
  ])('fails on %o', async (init, detail) => {
    const [result] = await checkCanonicalHost(context(always(init)))

    expect(result?.status).toBe('fail')
    expect(result?.detail).toMatch(detail)
  })

  it('reports a network error', async () => {
    const [result] = await checkCanonicalHost(context(() => Promise.reject(new Error('DNS failure'))))

    expect(result).toMatchObject({ status: 'fail', detail: 'DNS failure' })
  })
})

describe('checkTrailingSlash', () => {
  const probed = PAGES.find(({ path, type }) => type === 'text/html' && path !== '/')?.path ?? ''

  it('passes on a 308 whose location drops the slash', async () => {
    const get = vi.fn(always({ status: 308, headers: { location: `${SITE_URL}${probed}` } }))

    expect(statuses(await checkTrailingSlash(context(get), PAGES))).toEqual(['pass'])
    expect(get).toHaveBeenCalledWith(`${SITE_URL}${probed}/`)
  })

  it.each([
    [{ status: 200, headers: { location: `${SITE_URL}${probed}` } }, /atteso 308/],
    [{ status: 308, headers: { location: `${SITE_URL}/altrove` } }, /non punta a/],
    [{ status: 308, headers: {} }, /location ""/],
  ])('fails on %o', async (init, detail) => {
    const [result] = await checkTrailingSlash(context(always(init)), PAGES)

    expect(result?.status).toBe('fail')
    expect(result?.detail).toMatch(detail)
  })

  it('reports a network error', async () => {
    const [result] = await checkTrailingSlash(
      context(() => Promise.reject(new Error('ECONNRESET'))),
      PAGES,
    )

    expect(result).toMatchObject({ status: 'fail', detail: 'ECONNRESET' })
  })

  it('skips on a site whose only HTML route is the root, where no slash can be dropped', async () => {
    const get = vi.fn(always({}))

    const [result] = await checkTrailingSlash(context(get), [{ path: '/', type: 'text/html' }])

    expect(result).toMatchObject({ status: 'skip' })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('runChecks', () => {
  it('runs every check, in order', async () => {
    const headers = { ...secureHeaders(), 'content-type': 'text/html' }

    const results = await runChecks(context(always({ headers })), PAGES)

    expect(results.map(({ check }) => check)).toEqual([
      ...PAGES.map(({ path }) => `GET ${path}`),
      ...Object.keys(SECURITY_HEADERS).map((header) => `header ${header}`),
      'nessun x-robots-tag sull’host di produzione',
      'challenge di BotID servita dalla stessa origine',
      'www → apice 308',
      'barra finale → 308',
    ])
  })
})
