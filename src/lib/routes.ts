import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PageFile = { file: string; source: string }

type DynamicRoute = { pattern: RegExp; label: string; file: string }

export type Expectations = {
  exact: { route: string; file: string }[]
  patterns: DynamicRoute[]
  disabled: DynamicRoute[]
  ssr: string[]
}

export type VerifiedRoute = { path: string; type: string }

/** `/blog/[slug]` → `/blog/hello-world`: il percorso vero che sta per il pattern. */
export type Representatives = Readonly<Record<string, string>>

export const ERROR_PAGES: readonly string[] = ['/404', '/500']

// Non escono da una pagina .astro: `robots.txt.ts` e `site.webmanifest.ts` sono endpoint,
// `sitemap-index.xml` lo emette @astrojs/sitemap e `/api/health` è `prerender = false`.
export const NON_HTML_ROUTES: readonly VerifiedRoute[] = [
  { path: '/robots.txt', type: 'text/plain' },
  { path: '/sitemap-index.xml', type: 'xml' },
  // In produzione il MIME viene dall'estensione .webmanifest, non dall'intestazione che
  // l'endpoint imposta: si verifica la famiglia json invece di fissarne una delle due forme.
  { path: '/site.webmanifest', type: 'json' },
  { path: '/api/health', type: 'application/json' },
]

export function filesWithExtension(dir: string, extension: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesWithExtension(path, extension)
    return entry.name.endsWith(extension) ? [path] : []
  })
}

export function readPageFiles(pagesDir: string): PageFile[] {
  return filesWithExtension(pagesDir, '.astro').map((file) => ({ file, source: readFileSync(file, 'utf8') }))
}

const toPosix = (path: string, prefix: string): string => path.slice(prefix.length).split(/[\\/]/).join('/')

export function routeOf(htmlPath: string, dist: string): string {
  const route = toPosix(htmlPath, dist).replace(/\/index\.html$/, '')
  return route.replace(/\.html$/, '') || '/'
}

const SSR_OPT_OUT = /^\s*export\s+const\s+prerender\s*=\s*false\b/m

export function pageRouteOf(file: string, pagesDir: string): string {
  return (
    toPosix(file, pagesDir)
      .replace(/\.astro$/, '')
      .replace(/\/index$/, '') || '/'
  )
}

const PARAMETER = /(\[[^\]]*\])/

function segmentPattern(segment: string): string {
  return segment
    .split(PARAMETER)
    .map((part) => (part.startsWith('[') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('')
}

const TRAILING_REST_SEGMENT = /\/\[\.\.\.[^/]*\]$/

// Anche un segmento rest finale fa match col vuoto: `paginate()` emette la prima pagina come
// percorso nudo (`/news`, mai `/news/1`), quindi esigere un segmento boccia un archivio di una pagina.
export function routePattern(route: string): RegExp {
  const body = (path: string) => path.split('/').map(segmentPattern).join('/')
  if (!TRAILING_REST_SEGMENT.test(route)) return new RegExp(`^${body(route)}$`)
  return new RegExp(`^${body(route.replace(TRAILING_REST_SEGMENT, ''))}(?:/.*)?$`)
}

export function expectedRoutes(
  pages: readonly PageFile[],
  pagesDir: string,
  disabled: readonly string[] = [],
): Expectations {
  const expectations: Expectations = { exact: [], patterns: [], disabled: [], ssr: [] }
  for (const { file, source } of pages) {
    if (SSR_OPT_OUT.test(source)) {
      expectations.ssr.push(file)
      continue
    }
    const route = pageRouteOf(file, pagesDir)
    if (!route.includes('[')) {
      expectations.exact.push({ route, file })
      continue
    }
    const target = disabled.includes(route) ? expectations.disabled : expectations.patterns
    target.push({ pattern: routePattern(route), label: route, file })
  }
  return expectations
}

export type EmittedRoutes = { html: readonly string[]; ssr: readonly string[] }

// Il manifest di Astro nomina una rotta resa a richiesta col suo pattern (`/blog/[slug]`), non coi percorsi che serve.
const emits = ({ pattern, label }: DynamicRoute, { html, ssr }: EmittedRoutes): boolean =>
  html.some((route) => pattern.test(route)) || ssr.includes(label)

/** [HARD] Guardia fail-open: ogni asserzione per rotta itera sulle pagine emesse, quindi una dist vuota non asserisce niente. */
export function missingRouteFailures(expected: Expectations, emitted: EmittedRoutes, dist: string): string[] {
  if (emitted.html.length + emitted.ssr.length === 0) {
    return [`${dist} non contiene nessun .html: nessuna rotta misurata, quindi i budget per rotta non affermano niente`]
  }

  const failures: string[] = []
  const routes = new Set([...emitted.html, ...emitted.ssr])
  for (const { route, file } of expected.exact) {
    if (!routes.has(route)) failures.push(`rotta mancante ${route}: ${file} è prerenderizzata ma non ha emesso HTML`)
  }
  for (const page of expected.patterns) {
    if (emits(page, emitted)) continue
    failures.push(`rotta mancante ${page.label}: ${page.file} è prerenderizzata ma getStaticPaths non ha emesso niente`)
  }
  return failures
}

const SHOWN = 3

export const listed = (routes: readonly string[]): string =>
  routes.length <= SHOWN ? routes.join(', ') : `${routes.slice(0, SHOWN).join(', ')} e altre ${routes.length - SHOWN}`

export function disabledRouteFailures(expected: Expectations, { html, ssr }: EmittedRoutes): string[] {
  const exact = new Set(expected.exact.map(({ route }) => route))
  const unexplained = html.filter(
    (route) => !exact.has(route) && !expected.patterns.some(({ pattern }) => pattern.test(route)),
  )
  return expected.disabled.flatMap(({ pattern, label }) => {
    if (ssr.includes(label)) {
      return [
        `rotta spenta ${label}: è in \`routes.disabled\`, ma la build la rende a richiesta, e si spegne solo una pagina prerenderizzata`,
      ]
    }
    const routes = unexplained.filter((route) => pattern.test(route)).sort()
    if (routes.length === 0) return []
    return [`rotta spenta ${label}: è in \`routes.disabled\`, ma la build ha emesso ${listed(routes)}`]
  })
}

export function unknownDisabled(expected: Expectations, disabled: readonly string[] = []): string[] {
  const known = new Set(expected.disabled.map(({ label }) => label))
  return disabled.filter((label) => !known.has(label))
}

/** I pattern dinamici che `officina.config.ts` non ha ancora mandato nessuno a visitare. */
export function missingRepresentatives(expected: Expectations, representatives: Representatives = {}): string[] {
  return expected.patterns
    .map(({ label }) => label)
    .filter((label) => representatives[label] === undefined)
    .sort()
}

// Ordinate: l'ordine nativo di readdirSync cambia da un filesystem all'altro. Un pattern dinamico
// entra col percorso vero che il progetto gli ha dato: senza, resta una pagina che nessuno guarda.
export function auditRoutes(expected: Expectations, representatives: Representatives = {}): string[] {
  const exact = expected.exact.map(({ route }) => route).filter((route) => !ERROR_PAGES.includes(route))
  const stand = expected.patterns
    .map(({ label }) => representatives[label])
    .filter((path): path is string => path !== undefined)
  return [...exact, ...stand].sort()
}

export function smokeRoutes(
  expected: Expectations,
  nonHtmlRoutes: readonly VerifiedRoute[] = NON_HTML_ROUTES,
  representatives: Representatives = {},
): VerifiedRoute[] {
  return [...auditRoutes(expected, representatives).map((path) => ({ path, type: 'text/html' })), ...nonHtmlRoutes]
}

export function orphanExceptions(expected: Expectations): string[] {
  const routes = new Set(expected.exact.map(({ route }) => route))
  return ERROR_PAGES.filter((page) => !routes.has(page))
}
