import { type Expectations, pageRouteOf, type Representatives } from './routes.ts'
import type { CheckResult, SmokeContext, SmokeResponse } from './smoke-production.ts'

export type OnDemandPage = { label: string; path?: string }

export function onDemandPages(
  expected: Expectations,
  pagesDir: string,
  representatives: Representatives = {},
): OnDemandPage[] {
  return expected.ssr
    .map((file) => pageRouteOf(file, pagesDir))
    .sort()
    .map((label) => {
      const path = label.includes('[') ? representatives[label] : label
      return path === undefined ? { label } : { label, path }
    })
}

const META = /<meta\b[^>]*>/gi
const HTTP_EQUIV = /(?<![-\w])http-equiv\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const CONTENT = /(?<![-\w])content\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i
const SCRIPT_SRC = /(?:^|;)\s*script-src(?:\s|;|$)/i

const attributeValue = (tag: string, attribute: RegExp): string => {
  const match = attribute.exec(tag)
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}

const hasCspMeta = (html: string): boolean =>
  [...html.matchAll(META)].some(
    ([tag]) =>
      attributeValue(tag, HTTP_EQUIV).toLowerCase() === 'content-security-policy' &&
      SCRIPT_SRC.test(attributeValue(tag, CONTENT)),
  )

// TODO: dalla 0.13.0 un'anomalia di una pagina resa a richiesta fa fallire lo smoke: qui `warn` diventa `fail`.
const warn = (check: string, detail: string): CheckResult => ({ check, status: 'warn', detail })

function redirect(check: string, response: SmokeResponse, url: string): CheckResult {
  const location = response.headers.get('location')
  if (location === null) return warn(check, `risponde ${response.status} senza location`)
  const target = new URL(location, url)
  const { origin } = new URL(url)
  if (target.origin !== origin) return warn(check, `rimanda a ${target.href}, fuori da ${origin}`)
  return { check, status: 'pass' }
}

async function visit({ get, baseUrl }: SmokeContext, path: string): Promise<CheckResult> {
  const check = `GET ${path} (a richiesta)`
  const url = `${baseUrl}${path}`
  try {
    const response = await get(url)
    if (response.status >= 300 && response.status < 400) return redirect(check, response, url)
    if (response.status !== 200) {
      return warn(check, `atteso 200 o un redirect sulla stessa origine, ricevuto ${response.status}`)
    }
    const contentType = response.headers.get('content-type') ?? ''
    if (!contentType.includes('text/html'))
      return warn(check, `atteso un content-type text/html, ricevuto "${contentType}"`)
    if (!hasCspMeta((await response.text?.()) ?? ''))
      return warn(check, 'manca il meta Content-Security-Policy con script-src')
    return { check, status: 'pass' }
  } catch (error) {
    return warn(check, error instanceof Error ? error.message : String(error))
  }
}

export async function checkOnDemandPages(context: SmokeContext): Promise<CheckResult[]> {
  const results: CheckResult[] = []
  for (const { label, path } of context.onDemand ?? []) {
    if (path !== undefined) results.push(await visit(context, path))
    else {
      const detail = 'pagina dinamica senza rappresentante in `routes.representatives`'
      results.push({ check: `pagina ${label} (a richiesta)`, status: 'skip', detail })
    }
  }
  return results
}
