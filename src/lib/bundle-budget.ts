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

export function staticClosure(entries: Iterable<string>, chunks: Map<string, Chunk>): Set<string> {
  const seen = new Set<string>()
  const queue = [...entries]
  while (queue.length > 0) {
    const name = queue.pop()
    if (name === undefined || seen.has(name)) continue
    const chunk = chunks.get(name)
    if (chunk === undefined) continue
    seen.add(name)
    queue.push(...chunk.static)
  }
  return seen
}

export function deferredClosure(reached: Set<string>, chunks: Map<string, Chunk>): Set<string> {
  const entries = [...reached].flatMap((name) => [...(chunks.get(name)?.dynamic ?? [])])
  return new Set([...staticClosure(entries, chunks)].filter((name) => !reached.has(name)))
}

export const CSS_BUDGET_GZIP = 12 * 1024

export type Stylesheet = { file: string; gzip: number }

export function heaviestStylesheet(sheets: readonly Stylesheet[]): Stylesheet | null {
  return sheets.reduce<Stylesheet | null>((worst, sheet) => (worst && worst.gzip >= sheet.gzip ? worst : sheet), null)
}

// Astro emette un foglio di stile per gruppo di pagine e una rotta ne collega esattamente uno,
// quindi la loro somma è fatta di byte che nessun visitatore scarica mai insieme.
export function cssBudgetFailure(sheets: readonly Stylesheet[], maxGzip = CSS_BUDGET_GZIP): string | null {
  const heaviest = heaviestStylesheet(sheets)
  if (heaviest === null || heaviest.gzip <= maxGzip) return null
  const over = heaviest.gzip - maxGzip
  return `CSS ${(heaviest.gzip / 1024).toFixed(1)} KB gz > ${(maxGzip / 1024).toFixed(1)} KB (+${(over / 1024).toFixed(1)} KB) in ${heaviest.file}`
}
