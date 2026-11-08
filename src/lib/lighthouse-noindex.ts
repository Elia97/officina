import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { keepsOutOfIndex } from './smoke-robots.ts'

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

const META = /<meta\b[^>]*>/gi
const NAMED_ROBOTS = /\bname\s*=\s*(["']?)robots\1(?=[\s/>])/i
const CONTENT = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i
const FETCH_TIMEOUT_MS = 15_000

function metaRobots(html: string): string[] {
  return [...html.matchAll(META)]
    .map(([tag]) => tag)
    .filter((tag) => NAMED_ROBOTS.test(tag))
    .map((tag) => {
      const content = CONTENT.exec(tag)
      return content?.[1] ?? content?.[2] ?? ''
    })
}

export function outOfIndex(html: string, header: string | null = null): boolean {
  const directives = header === null ? metaRobots(html) : [header, ...metaRobots(html)]
  return directives.some(keepsOutOfIndex)
}

const htmlFiles = (dir: string, route: string): string[] =>
  route === '/' ? [join(dir, 'index.html')] : [join(dir, route, 'index.html'), join(dir, `${route}.html`)]

export function noindexInBuild(dir: string, routes: readonly string[]): Set<string> {
  return new Set(
    routes.filter((route) => {
      const file = htmlFiles(dir, route).find((candidate) => existsSync(candidate))
      return file !== undefined && outOfIndex(readFileSync(file, 'utf8'))
    }),
  )
}

/** Una pagina che non risponde resta indicizzabile: il SEO si asserisce, e il guasto lo riporta Lighthouse. */
export async function noindexOnSite(
  base: string,
  routes: readonly string[],
  fetchPage: Fetch = fetch,
): Promise<Set<string>> {
  const verdicts = await Promise.all(
    routes.map(async (route) => {
      try {
        const response = await fetchPage(`${base}${route}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
        return response.ok && outOfIndex(await response.text(), response.headers.get('x-robots-tag'))
      } catch {
        return false
      }
    }),
  )
  return new Set(routes.filter((_, index) => verdicts[index]))
}
