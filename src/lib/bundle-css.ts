import type { Stylesheet } from './bundle-budget.ts'

export type RouteStylesheets = { route: string; stylesheets: readonly string[] }

export type CssGroup = { stylesheets: string[]; gzip: number; routes: string[] }

export type CssMeasure = { groups: CssGroup[]; failures: string[] }

export type CssSource = { file: string; css: string }

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
const MEDIA_PRELUDE = /(?<=@media\b)[^{;]*/gi
const RANGE_COMPARISON = /[<>=]/
const STYLE_ELEMENT = /<style\b[^>]*>([\s\S]*?)<\/style>/gi

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

export const routeCount = (count: number): string => (count === 1 ? '1 rotta' : `${count} rotte`)

function overBudget({ stylesheets, gzip, routes }: CssGroup, maxGzip: number): string {
  const weight = `CSS ${kb(gzip)} > ${kb(maxGzip)} (+${kb(gzip - maxGzip)})`
  if (routes.length === 0)
    return `${stylesheets.join(' + ')}: ${weight}, pesato da solo: nessuna rotta misurata lo collega`
  const [first] = [...routes].sort()
  return `${first}: ${weight} — ${stylesheets.join(' + ')}, su ${routeCount(routes.length)}`
}

export function measureCss(
  routes: readonly RouteStylesheets[],
  sheets: readonly Stylesheet[],
  maxGzip: number,
  assets: string,
): CssMeasure {
  const weights = new Map(sheets.map(({ file, gzip }) => [file, gzip]))
  const groups = new Map<string, CssGroup>()
  const failures: string[] = []
  for (const { route, stylesheets } of routes) {
    const linked = [...new Set(stylesheets)].sort()
    for (const name of linked.filter((sheet) => !weights.has(sheet)))
      failures.push(`${route}: il foglio ${name} non è in ${assets}, e il CSS della rotta non si misura per intero`)
    if (linked.length === 0) continue
    const key = linked.join(' + ')
    const gzip = linked.reduce((sum, sheet) => sum + (weights.get(sheet) ?? 0), 0)
    const group = groups.get(key) ?? { stylesheets: linked, gzip, routes: [] }
    group.routes.push(route)
    groups.set(key, group)
  }
  const linkedAnywhere = new Set(routes.flatMap(({ stylesheets }) => stylesheets))
  for (const { file, gzip } of sheets)
    if (!linkedAnywhere.has(file)) groups.set(file, { stylesheets: [file], gzip, routes: [] })
  const measured = [...groups.values()].sort((a, b) => b.gzip - a.gzip)
  failures.push(...measured.filter((group) => group.gzip > maxGzip).map((group) => overBudget(group, maxGzip)))
  return { groups: measured, failures }
}

export function rangeMediaQueries(css: string): string[] {
  const preludes = [...css.replace(CSS_COMMENT, ' ').matchAll(MEDIA_PRELUDE)].map(([prelude]) => prelude.trim())
  return [...new Set(preludes.filter((prelude) => RANGE_COMPARISON.test(prelude)))]
}

export const inlineStyles = (html: string): string => [...html.matchAll(STYLE_ELEMENT)].map(([, css]) => css).join('\n')

export function rangeQueryFailures(sources: readonly CssSource[]): string[] {
  return sources.flatMap(({ file, css }) => {
    const queries = rangeMediaQueries(css)
    if (queries.length === 0) return []
    return [
      `${file}: media query in sintassi di intervallo, che Safari legge solo dalla 16.4 — ${queries.join(', ')}; si abbassano con \`vite.build.cssTarget\``,
    ]
  })
}
