import { listed } from './routes.ts'

export type LinkTarget = { kind: 'placeholder' | 'anchor' | 'scheme' | 'external' } | { kind: 'internal'; path: string }

export type PageLinks = { route: string; hrefs: readonly string[] }

export type LinkReport = {
  broken: { destination: string; pages: string[] }[]
  internal: number
  onDemand: number
  outside: { external: number; scheme: number; anchor: number }
}

const VALUE = String.raw`(?:"[^"]*"|'[^']*'|[^\s"'>]+)`
const ATTRIBUTES = String.raw`(?:\s+[^\s"'>/=]+(?:\s*=\s*${VALUE})?)*`
// Astro conserva i commenti HTML, e nei valori dinamici degli attributi scappa solo `&` e `"`.
const MARKUP = new RegExp(
  String.raw`<!--[\s\S]*?-->|<(script|style)\b${ATTRIBUTES}\s*\/?>[\s\S]*?<\/\1\s*>|<a(${ATTRIBUTES})\s*\/?>|<[a-z][^\s/>]*${ATTRIBUTES}\s*\/?>`,
  'gi',
)
const ATTRIBUTE = /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const ENTITY = /&(?:#(\d{1,6})|#x([\da-f]{1,5})|(amp|lt|gt|quot|apos));/gi
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as const

const SCHEME = /^[a-z][a-z\d+.-]*:/i
const WEB = /^https?:/i
const NO_SITE = 'https://officina.invalid'

const decodeEntities = (value: string): string =>
  value.replace(ENTITY, (_, decimal?: string, hex?: string, name?: string) => {
    if (decimal !== undefined) return String.fromCodePoint(Number(decimal))
    if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16))
    return NAMED[(name as string).toLowerCase() as keyof typeof NAMED]
  })

function hrefOf(attributes: string): string | undefined {
  for (const [, name, double, single, bare] of attributes.matchAll(ATTRIBUTE)) {
    if ((name as string).toLowerCase() === 'href') return decodeEntities(double ?? single ?? bare ?? '')
  }
  return undefined
}

export function htmlLinks(html: string): string[] {
  return [...html.matchAll(MARKUP)]
    .map(([, , attributes]) => (attributes === undefined ? undefined : hrefOf(attributes)))
    .filter((href) => href !== undefined)
}

export const siteOrigin = (siteUrl: string | undefined): string =>
  siteUrl !== undefined && URL.canParse(siteUrl) ? new URL(siteUrl).origin : NO_SITE

function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

export function linkTarget(href: string, page: URL): LinkTarget {
  const value = href.trim()
  if (value === '' || value === '#') return { kind: 'placeholder' }
  if (value.startsWith('#')) return { kind: 'anchor' }
  if (SCHEME.test(value) && !WEB.test(value)) return { kind: 'scheme' }
  if (!URL.canParse(value, page)) return { kind: 'internal', path: value }
  const url = new URL(value, page)
  return url.origin === page.origin ? { kind: 'internal', path: decoded(url.pathname) } : { kind: 'external' }
}

export function servedPaths(files: readonly string[]): Set<string> {
  const served = new Set<string>()
  for (const file of files) {
    served.add(file)
    if (file.endsWith('/index.html')) served.add(file.slice(0, -'/index.html'.length) || '/')
    else if (file.endsWith('.html')) served.add(file.slice(0, -'.html'.length))
  }
  return served
}

const withoutTrailingSlash = (path: string): string => (path.length > 1 ? path.replace(/\/+$/, '') : path)

export function servedBy(
  path: string,
  served: ReadonlySet<string>,
  onDemand: readonly RegExp[],
): 'build' | 'on-demand' | undefined {
  const bare = withoutTrailingSlash(path)
  if (served.has(path) || served.has(bare)) return 'build'
  return onDemand.some((pattern) => pattern.test(bare)) ? 'on-demand' : undefined
}

const placeholderLabel = (href: string): string => `segnaposto href="${href.trim()}"`

export function linkReport(
  pages: readonly PageLinks[],
  origin: string,
  served: ReadonlySet<string>,
  onDemand: readonly RegExp[],
): LinkReport {
  const citing = new Map<string, Set<string>>()
  const report: LinkReport = { broken: [], internal: 0, onDemand: 0, outside: { external: 0, scheme: 0, anchor: 0 } }
  const cite = (destination: string, route: string) =>
    citing.set(destination, (citing.get(destination) ?? new Set()).add(route))
  const checkInternal = (path: string, route: string) => {
    report.internal++
    const by = servedBy(path, served, onDemand)
    if (by === undefined) cite(withoutTrailingSlash(path), route)
    if (by === 'on-demand') report.onDemand++
  }
  for (const { route, hrefs } of pages) {
    const page = new URL(route, origin)
    for (const href of hrefs) {
      const target = linkTarget(href, page)
      if (target.kind === 'placeholder') cite(placeholderLabel(href), route)
      else if (target.kind === 'internal') checkInternal(target.path, route)
      else report.outside[target.kind]++
    }
  }
  report.broken = [...citing]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([destination, routes]) => ({ destination, pages: [...routes].sort() }))
  return report
}

export const brokenLines = ({ broken }: LinkReport): string[] =>
  broken.map(({ destination, pages }) => `${destination} ← ${listed(pages)}`)
