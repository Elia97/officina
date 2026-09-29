export type Chunk = { gzip: number; static: Set<string>; dynamic: Set<string> }

export type Budget = { label: string; matches: (route: string) => boolean; maxGzip: number }

// 20 KB è ~1,5× la rotta più pesante misurata nello starter (/contatti, 13,4 KB gz).
const DEFAULT_BUDGET: Budget = { label: 'default', matches: () => true, maxGzip: 20 * 1024 }

/** Le classi del progetto vengono prima, nell'ordine in cui `officina.config.ts` le dichiara. */
export function budgetFor(route: string, budgets: readonly Budget[] = []): Budget {
  /* v8 ignore next -- DEFAULT_BUDGET accetta ogni rotta, quindi find() non torna mai undefined */
  return [...budgets, DEFAULT_BUDGET].find((budget) => budget.matches(route)) ?? DEFAULT_BUDGET
}

const captured = (source: string, pattern: RegExp, group: number): Set<string> =>
  new Set([...source.matchAll(pattern)].map((match) => match[group]).filter((name) => name !== undefined))

/** Rollup racchiude gli specificatori statici con `"` e i dinamici in un template literal. */
export function parseEdges(source: string): Pick<Chunk, 'static' | 'dynamic'> {
  return {
    static: captured(source, /(?:from|import)\s*(["'`])\.\/([^"'`]+\.js)\1/g, 2),
    dynamic: captured(source, /import\(\s*(["'`])\.\/([^"'`]+\.js)\1\s*\)/g, 2),
  }
}

export function htmlEntries(html: string): string[] {
  return [...captured(html, /(?:src|href)="\/_astro\/([^"]+\.js)"/g, 1)]
}

const LINK_TAG = /<link\b[^>]*>/gi
const STYLESHEET_REL = /\brel=["']?stylesheet\b/i
const LOCAL_STYLESHEET = /\bhref=["']?[^"'\s>]*?\/_astro\/([^"'\s>?#]+\.css)/i

export function htmlStylesheets(html: string): string[] {
  const links = [...html.matchAll(LINK_TAG)].map(([tag]) => tag).filter((tag) => STYLESHEET_REL.test(tag))
  return [...new Set(links.map((tag) => tag.match(LOCAL_STYLESHEET)?.[1]).filter((name) => name !== undefined))]
}

/** `unknown`: i nomi citati che in `dist/client/_astro` non ci sono — saltarli vorrebbe dire misurare meno del vero. */
export type Closure = { reached: Set<string>; unknown: Set<string> }

export function staticClosure(entries: Iterable<string>, chunks: Map<string, Chunk>): Closure {
  const reached = new Set<string>()
  const unknown = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined || reached.has(name)) continue
    const chunk = chunks.get(name)
    if (chunk === undefined) {
      unknown.add(name)
      continue
    }
    reached.add(name)
    queue.push(...chunk.static)
  }
  return { reached, unknown }
}

export function deferredClosure(reached: Set<string>, chunks: Map<string, Chunk>): Set<string> {
  const entries = [...reached].flatMap((name) => [...(chunks.get(name)?.dynamic ?? [])])
  return new Set([...staticClosure(entries, chunks).reached].filter((name) => !reached.has(name)))
}

export const CSS_BUDGET_GZIP = 12 * 1024

export type Stylesheet = { file: string; gzip: number }
