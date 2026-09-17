import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PageFile = { file: string; source: string }

export type Expectations = {
  exact: { route: string; file: string }[]
  patterns: { pattern: RegExp; label: string; file: string }[]
  ssr: string[]
}

export type VerifiedRoute = { path: string; type: string }

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

function pageRouteOf(file: string, pagesDir: string): string {
  return (
    toPosix(file, pagesDir)
      .replace(/\.astro$/, '')
      .replace(/\/index$/, '') || '/'
  )
}

function segmentPattern(segment: string): string {
  if (segment.startsWith('[')) return '[^/]+'
  return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const TRAILING_REST_SEGMENT = /\/\[\.\.\.[^/]*\]$/

// Anche un segmento rest finale fa match col vuoto: `paginate()` emette la prima pagina come
// percorso nudo (`/news`, mai `/news/1`), quindi esigere un segmento boccia un archivio di una pagina.
function routePattern(route: string): RegExp {
  const body = (path: string) => path.split('/').map(segmentPattern).join('/')
  if (!TRAILING_REST_SEGMENT.test(route)) return new RegExp(`^${body(route)}$`)
  return new RegExp(`^${body(route.replace(TRAILING_REST_SEGMENT, ''))}(?:/.*)?$`)
}

export function expectedRoutes(pages: readonly PageFile[], pagesDir: string): Expectations {
  const expectations: Expectations = { exact: [], patterns: [], ssr: [] }
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
    expectations.patterns.push({ pattern: routePattern(route), label: route, file })
  }
  return expectations
}

/** [HARD] Guardia fail-open: ogni asserzione per rotta itera sulle pagine emesse, quindi una dist vuota non asserisce niente. */
export function missingRouteFailures(expected: Expectations, emitted: readonly string[], dist: string): string[] {
  if (emitted.length === 0) {
    return [`${dist} non contiene nessun .html: nessuna rotta misurata, quindi i budget per rotta non affermano niente`]
  }

  const failures: string[] = []
  const routes = new Set(emitted)
  for (const { route, file } of expected.exact) {
    if (!routes.has(route)) failures.push(`rotta mancante ${route}: ${file} è prerenderizzata ma non ha emesso HTML`)
  }
  for (const { pattern, label, file } of expected.patterns) {
    if (emitted.some((route) => pattern.test(route))) continue
    failures.push(`rotta mancante ${label}: ${file} è prerenderizzata ma getStaticPaths non ha emesso niente`)
  }
  return failures
}

// Ordinate: l'ordine nativo di readdirSync cambia da un filesystem all'altro.
export function auditRoutes(expected: Expectations): string[] {
  return expected.exact
    .map(({ route }) => route)
    .filter((route) => !ERROR_PAGES.includes(route))
    .sort()
}

export function smokeRoutes(
  expected: Expectations,
  nonHtmlRoutes: readonly VerifiedRoute[] = NON_HTML_ROUTES,
): VerifiedRoute[] {
  return [...auditRoutes(expected).map((path) => ({ path, type: 'text/html' })), ...nonHtmlRoutes]
}

export function orphanExceptions(expected: Expectations): string[] {
  const routes = new Set(expected.exact.map(({ route }) => route))
  return ERROR_PAGES.filter((page) => !routes.has(page))
}
