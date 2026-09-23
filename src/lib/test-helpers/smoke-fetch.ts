import { type Fetcher, SECURITY_HEADERS, type SmokeContext, type SmokeResponse } from '../smoke-production.ts'

export const SITE_URL = 'https://example.test'

export interface ResponseInit {
  ok?: boolean
  status?: number
  headers?: Record<string, string>
}

export const response = ({ ok = true, status = 200, headers = {} }: ResponseInit): SmokeResponse => ({
  ok,
  status,
  headers: { get: (name) => headers[name] ?? null },
})

export const always =
  (init: ResponseInit): Fetcher =>
  () =>
    Promise.resolve(response(init))

export const context = (get: Fetcher, baseUrl = SITE_URL): SmokeContext => ({
  get,
  baseUrl,
  siteUrl: SITE_URL,
  securityHeaders: SECURITY_HEADERS,
  botIdRequired: true,
})

export const secureHeaders = (): Record<string, string> =>
  Object.fromEntries(Object.entries(SECURITY_HEADERS).map(([header, expected]) => [header, expected ?? 'set']))

export const statuses = (results: { status: string }[]): string[] => results.map(({ status }) => status)
