import { describe, expect, it, vi } from 'vitest'
import { checkPages, checkSecurityHeaders, type Fetcher, waitForAlias } from './smoke-production.ts'
import { always, context, response, secureHeaders, statuses } from './test-helpers/smoke-fetch.ts'
import { PAGES } from './test-helpers/smoke-pages.ts'

// Il content-type che il bordo serve davvero per ogni `type` che smokeRoutes() dichiara.
const SERVED_CONTENT_TYPE: Record<string, string> = {
  'text/html': 'text/html; charset=utf-8',
  'text/plain': 'text/plain; charset=utf-8',
  xml: 'application/xml',
  json: 'application/manifest+json; charset=utf-8',
  'application/json': 'application/json',
}

const contentTypeFor = (url: string) => {
  const longestMatch = [...PAGES].sort((a, b) => b.path.length - a.path.length).find(({ path }) => url.endsWith(path))
  return SERVED_CONTENT_TYPE[longestMatch?.type ?? 'text/html'] ?? 'text/html; charset=utf-8'
}

describe('waitForAlias', () => {
  it('stops at the first ok response, so a healthy alias costs one request', async () => {
    const get = vi.fn(always({ ok: true }))
    const sleep = vi.fn(() => Promise.resolve())

    await waitForAlias(context(get), sleep)

    expect(get).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('backs off between attempts and gives up without reporting anything', async () => {
    const get = vi.fn(always({ ok: false }))
    const sleep = vi.fn(() => Promise.resolve())

    await expect(waitForAlias(context(get), sleep, 3)).resolves.toBeUndefined()

    expect(get).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[2000], [4000]])
  })

  it('swallows a network error, because the checks report it with its message', async () => {
    const get = vi.fn(() => Promise.reject(new Error('ENOTFOUND')))

    await expect(waitForAlias(context(get), () => Promise.resolve(), 2)).resolves.toBeUndefined()

    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe('checkPages', () => {
  it('passes every declared page when the status and content-type line up', async () => {
    const get: Fetcher = (url) => Promise.resolve(response({ headers: { 'content-type': contentTypeFor(url) } }))

    expect(statuses(await checkPages(context(get), PAGES))).toEqual(PAGES.map(() => 'pass'))
  })

  it.each([
    [{ status: 404, headers: { 'content-type': 'text/html' } }, /atteso 200, ricevuto 404/],
    [{ headers: { 'content-type': 'application/json' } }, /atteso un content-type text\/html/],
    [{ headers: {} }, /ricevuto ""/],
  ])('fails the root page on %o', async (init, detail) => {
    const [root] = await checkPages(context(always(init)), PAGES)

    expect(root?.status).toBe('fail')
    expect(root?.detail).toMatch(detail)
  })

  it('reports a network error as the failure detail', async () => {
    const [root] = await checkPages(
      context(() => Promise.reject(new Error('ECONNREFUSED'))),
      PAGES,
    )

    expect(root).toMatchObject({ status: 'fail', detail: 'ECONNREFUSED' })
  })

  it('stringifies a thrown non-Error', async () => {
    const [root] = await checkPages(
      context(() => Promise.reject('socket hang up')),
      PAGES,
    )

    expect(root?.detail).toBe('socket hang up')
  })
})

describe('checkSecurityHeaders', () => {
  it('passes when every header is present and the pinned values match', async () => {
    const results = await checkSecurityHeaders(context(always({ headers: secureHeaders() })))

    expect(statuses(results)).toEqual(results.map(() => 'pass'))
  })

  it('fails a missing header', async () => {
    const headers = secureHeaders()
    delete headers['referrer-policy']

    const results = await checkSecurityHeaders(context(always({ headers })))

    expect(results).toContainEqual({ check: 'header referrer-policy', status: 'fail', detail: 'assente' })
  })

  it('fails a pinned header whose value drifted', async () => {
    const headers = { ...secureHeaders(), 'x-frame-options': 'SAMEORIGIN' }

    const results = await checkSecurityHeaders(context(always({ headers })))

    expect(results).toContainEqual(
      expect.objectContaining({ check: 'header x-frame-options', detail: 'atteso "DENY", ricevuto "SAMEORIGIN"' }),
    )
  })

  it('fails when x-robots-tag reached the production host', async () => {
    const headers = { ...secureHeaders(), 'x-robots-tag': 'noindex' }

    const results = await checkSecurityHeaders(context(always({ headers })))

    expect(results.at(-1)).toMatchObject({ status: 'fail', detail: expect.stringContaining('noindex') })
  })

  it('reports one failure, not six, when the request itself fails', async () => {
    const results = await checkSecurityHeaders(context(() => Promise.reject(new Error('ETIMEDOUT'))))

    expect(results).toEqual([{ check: 'header di sicurezza', status: 'fail', detail: 'ETIMEDOUT' }])
  })
})
