import type { Stylesheet } from './bundle-budget.ts'

export type RouteStylesheets = { route: string; stylesheets: readonly string[] }

export type CssGroup = { stylesheets: string[]; gzip: number; routes: string[] }

export type CssMeasure = { groups: CssGroup[]; failures: string[] }

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
