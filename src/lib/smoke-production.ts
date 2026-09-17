import type { VerifiedRoute } from './routes.ts'

export interface SmokeResponse {
  ok: boolean
  status: number
  headers: { get: (name: string) => string | null }
}

export type Fetcher = (url: string) => Promise<SmokeResponse>

export interface SmokeContext {
  get: Fetcher
  baseUrl: string
  siteUrl: string
  securityHeaders: Record<string, string | null>
}

export type SmokeCheck = (context: SmokeContext, pages: readonly VerifiedRoute[]) => Promise<CheckResult[]>

export interface CheckResult {
  check: string
  status: 'pass' | 'fail' | 'skip'
  detail?: string
}

const pass = (check: string): CheckResult => ({ check, status: 'pass' })
const fail = (check: string, detail: string): CheckResult => ({ check, status: 'fail', detail })
const skip = (check: string, detail: string): CheckResult => ({ check, status: 'skip', detail })

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Dalla regola globale `/(.*)` di vercel.json. `null` = verifica solo la presenza; src/vercel-headers.test.ts fissa i valori.
export const SECURITY_HEADERS: Record<string, string | null> = {
  'content-security-policy': null,
  'strict-transport-security': null,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': null,
  'permissions-policy': null,
}

/** Deve corrispondere al `source` del rewrite in vercel.json. */
export const BOTID_CHALLENGE = '/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js'

/** L'alias di produzione di Vercel impiega un attimo a puntare al deployment appena caricato. */
export async function waitForAlias(
  { get, baseUrl }: SmokeContext,
  sleep: (ms: number) => Promise<void>,
  attempts = 5,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      if ((await get(baseUrl)).ok) return
    } catch {}
    if (attempt < attempts) await sleep(attempt * 2000)
  }
}

export async function checkPages(
  { get, baseUrl }: SmokeContext,
  pages: readonly VerifiedRoute[],
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const { path, type } of pages) {
    const check = `GET ${path}`
    try {
      const response = await get(`${baseUrl}${path}`)
      const contentType = response.headers.get('content-type') ?? ''
      if (response.status !== 200) results.push(fail(check, `atteso 200, ricevuto ${response.status}`))
      else if (!contentType.includes(type))
        results.push(fail(check, `atteso un content-type ${type}, ricevuto "${contentType}"`))
      else results.push(pass(check))
    } catch (error) {
      results.push(fail(check, messageOf(error)))
    }
  }
  return results
}

export async function checkSecurityHeaders({ get, baseUrl, securityHeaders }: SmokeContext): Promise<CheckResult[]> {
  let response: SmokeResponse
  try {
    response = await get(baseUrl)
  } catch (error) {
    return [fail('header di sicurezza', messageOf(error))]
  }

  const results = Object.entries(securityHeaders).map(([header, expected]) => {
    const check = `header ${header}`
    const value = response.headers.get(header)
    if (value === null) return fail(check, 'assente')
    if (expected !== null && value !== expected) return fail(check, `atteso "${expected}", ricevuto "${value}"`)
    return pass(check)
  })

  // Il noindex `has: host = *.vercel.app` di vercel.json applicato al dominio vero farebbe sparire il sito da ogni indice.
  const check = 'nessun x-robots-tag sull’host di produzione'
  const robots = response.headers.get('x-robots-tag')
  results.push(robots === null ? pass(check) : fail(check, `presente su ${baseUrl}: "${robots}"`))
  return results
}

export async function checkBotIdChallenge({ get, baseUrl }: SmokeContext): Promise<CheckResult[]> {
  const check = 'challenge di BotID servita dalla stessa origine'
  try {
    const response = await get(`${baseUrl}${BOTID_CHALLENGE}`)
    if (response.status !== 200) return [fail(check, `atteso 200 dal rewrite, ricevuto ${response.status}`)]
    return [pass(check)]
  } catch (error) {
    return [fail(check, messageOf(error))]
  }
}

/** Il 308 da www all'apice, da vercel.json: dipende dal DNS e dal dominio del progetto Vercel, non dal deployment. */
export async function checkCanonicalHost({ get, baseUrl, siteUrl }: SmokeContext): Promise<CheckResult[]> {
  const check = 'www → apice 308'
  if (baseUrl !== siteUrl) return [skip(check, `l’URL di base non è ${siteUrl}`)]
  try {
    const response = await get(`https://www.${new URL(siteUrl).host}/`)
    const location = response.headers.get('location') ?? ''
    if (response.status !== 308) return [fail(check, `atteso 308, ricevuto ${response.status}`)]
    if (!location.startsWith(siteUrl)) return [fail(check, `location "${location}" non punta a ${siteUrl}`)]
    return [pass(check)]
  } catch (error) {
    return [fail(check, messageOf(error))]
  }
}

export async function checkTrailingSlash(
  { get, baseUrl }: SmokeContext,
  pages: readonly VerifiedRoute[],
): Promise<CheckResult[]> {
  const page = pages.find(({ path, type }) => type === 'text/html' && path !== '/')
  const check = 'barra finale → 308'
  if (page === undefined) return [skip(check, 'nessuna pagina HTML oltre a / da sondare')]
  try {
    const response = await get(`${baseUrl}${page.path}/`)
    if (response.status !== 308) return [fail(check, `atteso 308 su ${page.path}/, ricevuto ${response.status}`)]
    const location = response.headers.get('location') ?? ''
    if (!location.endsWith(page.path)) return [fail(check, `location "${location}" non punta a ${page.path}`)]
    return [pass(check)]
  } catch (error) {
    return [fail(check, messageOf(error))]
  }
}

export const DEFAULT_CHECKS: readonly SmokeCheck[] = [
  checkPages,
  checkSecurityHeaders,
  checkBotIdChallenge,
  checkCanonicalHost,
  checkTrailingSlash,
]

/** In sequenza, non in parallelo: l'ordine dei risultati è quello dei controlli. */
export async function runChecks(
  context: SmokeContext,
  pages: readonly VerifiedRoute[],
  checks: readonly SmokeCheck[] = DEFAULT_CHECKS,
): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const check of checks) results.push(...(await check(context, pages)))
  return results
}
