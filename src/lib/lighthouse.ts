export interface LighthouseRc {
  ci: {
    collect: {
      url?: string[]
      numberOfRuns?: number
      startServerCommand?: string
      startServerReadyPattern?: string
      startServerReadyTimeout?: number
      settings?: Record<string, unknown>
    }
    upload?: Record<string, unknown>
    [section: string]: unknown
  }
}

export type LighthouseEnv = Partial<
  Record<'LH_PORT' | 'LH_RUNS' | 'LH_EXTERNAL_SERVER' | 'LH_BASE_URL' | 'LH_CHROME_FLAGS' | 'LH_OUT', string>
>

type Assertions = Record<string, unknown>

interface AssertOptions {
  assertions?: Assertions
  aggregationMethod?: unknown
  includePassedAssertions?: unknown
  [option: string]: unknown
}

const SEO_ASSERTIONS: ReadonlySet<string> = new Set(['categories:seo', 'is-crawlable'])
// LHCI 0.15.1 rifiuta `assertMatrix` accanto a `preset` e `budgetsFile`: con quelli le asserzioni restano uguali per ogni URL.
const SPLITTABLE: ReadonlySet<string> = new Set(['assertions', 'aggregationMethod', 'includePassedAssertions'])

const DEFAULT_PORT = '4321'
const SERVER_PORT = /(--listen|--port)([ =])\d+/

export type BaseUrlArg = { url?: string; error?: string }

export function baseUrlArg(args: readonly string[]): BaseUrlArg {
  const url = args.find((arg) => !arg.startsWith('--'))
  if (url === undefined) return {}
  const protocol = URL.parse(url)?.protocol
  if (protocol === 'http:' || protocol === 'https:') return { url: url.replace(/\/+$/, '') }
  return { error: `${url} non è un URL http(s): passa l'indirizzo di un sito già servito, per esempio https://…` }
}

export function seoAssertions(assert: unknown): Assertions | null {
  if (typeof assert !== 'object' || assert === null) return null
  const options = assert as AssertOptions
  if (Object.keys(options).some((option) => !SPLITTABLE.has(option))) return null
  const seo = Object.entries(options.assertions ?? {}).filter(([key]) => SEO_ASSERTIONS.has(key))
  return seo.length === 0 ? null : Object.fromEntries(seo)
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function withoutSeoOn(assert: unknown, excluded: readonly string[]): unknown {
  const seo = excluded.length === 0 ? null : seoAssertions(assert)
  if (seo === null) return assert
  const { assertions = {}, aggregationMethod, includePassedAssertions } = assert as AssertOptions
  const rest = Object.fromEntries(Object.entries(assertions).filter(([key]) => !SEO_ASSERTIONS.has(key)))
  const shared = aggregationMethod === undefined ? {} : { aggregationMethod }
  const matchingUrlPattern = `^(?!(?:${excluded.map(escapeRegExp).join('|')})/?$)`
  const assertMatrix = [
    ...(Object.keys(rest).length > 0 ? [{ ...shared, assertions: rest }] : []),
    { ...shared, matchingUrlPattern, assertions: seo },
  ]
  return includePassedAssertions === undefined ? { assertMatrix } : { includePassedAssertions, assertMatrix }
}

/** Le rotte arrivano da src/pages, il resto dal `.lighthouserc.json` del progetto; l'ambiente lo piega al giro locale. */
export function lighthouseConfig(
  rc: LighthouseRc,
  routes: readonly string[],
  env: LighthouseEnv,
  noindex: ReadonlySet<string> = new Set(),
): LighthouseRc {
  const port = env.LH_PORT ?? DEFAULT_PORT
  const base = env.LH_BASE_URL ?? `http://localhost:${port}`
  const collect = { ...rc.ci.collect, url: routes.map((route) => `${base}${route}`) }

  if (env.LH_RUNS) collect.numberOfRuns = Number(env.LH_RUNS)

  // Il server è già in ascolto: lo avvia lhci-local.sh, per servire una directory diversa, oppure è il sito dell'URL.
  if (env.LH_EXTERNAL_SERVER || env.LH_BASE_URL) {
    delete collect.startServerCommand
    delete collect.startServerReadyPattern
    delete collect.startServerReadyTimeout
  } else if (collect.startServerCommand !== undefined) {
    collect.startServerCommand = collect.startServerCommand.replace(SERVER_PORT, `$1$2${port}`)
  }

  if (env.LH_CHROME_FLAGS) collect.settings = { ...collect.settings, chromeFlags: env.LH_CHROME_FLAGS }

  const ci: LighthouseRc['ci'] = { ...rc.ci, collect }
  if (ci.assert !== undefined) {
    ci.assert = withoutSeoOn(
      ci.assert,
      routes.filter((route) => noindex.has(route)).map((route) => `${base}${route}`),
    )
  }
  if (env.LH_OUT) ci.upload = { target: 'filesystem', outputDir: env.LH_OUT }
  return { ci }
}
