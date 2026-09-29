#!/usr/bin/env node
// Gate del budget di bundle su dist/client — richiede un `astro build` completato.

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'

import {
  type Budget,
  budgetFor,
  type Chunk,
  CSS_BUDGET_GZIP,
  deferredClosure,
  htmlEntries,
  htmlStylesheets,
  parseEdges,
  type Stylesheet,
  staticClosure,
} from '../lib/bundle-budget.ts'
import { type CssMeasure, measureCss, routeCount } from '../lib/bundle-css.ts'
import { type PageEntries, readSsr, type SsrReading } from '../lib/bundle-ssr.ts'
import { missingInput } from '../lib/cli.ts'
import { loadConfig } from '../lib/config.ts'
import {
  type Expectations,
  expectedRoutes,
  filesWithExtension,
  missingRouteFailures,
  readPageFiles,
  routeOf,
} from '../lib/routes.ts'

const DIST = 'dist/client'
const ASSETS = join(DIST, '_astro')
const PAGES = 'src/pages'

type MeasuredPage = { route: string; gzip: number; deferredGzip: number; budget: Budget; unknown: string[] }

const gz = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`

function readStylesheets(): Stylesheet[] {
  return filesWithExtension(ASSETS, '.css').map((path) => ({
    file: relative(ASSETS, path),
    gzip: gzipSync(readFileSync(path)).length,
  }))
}

function readChunks(): Map<string, Chunk> {
  const chunks = new Map<string, Chunk>()
  for (const name of readdirSync(ASSETS).filter((f) => f.endsWith('.js'))) {
    const raw = readFileSync(join(ASSETS, name))
    chunks.set(name, { gzip: gzipSync(raw).length, ...parseEdges(raw.toString('utf8')) })
  }
  return chunks
}

function htmlPages(): PageEntries[] {
  return filesWithExtension(DIST, '.html').map((htmlPath) => {
    const html = readFileSync(htmlPath, 'utf8')
    return { route: routeOf(htmlPath, DIST), entries: htmlEntries(html), stylesheets: htmlStylesheets(html) }
  })
}

function measurePages(
  pages: readonly PageEntries[],
  chunks: Map<string, Chunk>,
  budgets: readonly Budget[],
): MeasuredPage[] {
  const total = (names: Set<string>) => [...names].reduce((sum, name) => sum + (chunks.get(name)?.gzip ?? 0), 0)
  return pages
    .map(({ route, entries }) => {
      const { reached, unknown } = staticClosure(entries, chunks)
      return {
        route,
        gzip: total(reached),
        deferredGzip: total(deferredClosure(reached, chunks)),
        budget: budgetFor(route, budgets),
        unknown: [...unknown].sort(),
      }
    })
    .sort((a, b) => b.gzip - a.gzip)
}

// Zero JavaScript su una rotta è un esito normale in Astro; un nome citato che fra i chunk non c'è
// vuol dire che la misura non copre tutto il bundle, e allora non afferma niente.
function unknownChunkFailures(pages: readonly MeasuredPage[]): string[] {
  return pages
    .filter((page) => page.unknown.length > 0)
    .map((page) => `${page.route}: formato del bundle non riconosciuto — ${page.unknown.join(', ')} non è in ${ASSETS}`)
}

function overBudgetFailures(pages: readonly MeasuredPage[]): string[] {
  return pages
    .filter((page) => page.gzip > page.budget.maxGzip)
    .map((page) => {
      const over = page.gzip - page.budget.maxGzip
      return `${page.route}: ${gz(page.gzip)} > ${gz(page.budget.maxGzip)} (+${gz(over)})`
    })
}

function printPages(pages: readonly MeasuredPage[], width: number): void {
  console.log('\nBudget di bundle — JS del client per rotta (gzip, chiusura statica)\n')
  console.log(
    `${'ROTTA'.padEnd(width)}   ${'STATICO'.padStart(9)}   ${'BUDGET'.padStart(9)}   ${'DIFFERITO'.padStart(9)}`,
  )
  for (const page of pages) {
    const deferred = page.deferredGzip > 0 ? gz(page.deferredGzip) : '—'
    const line = `${page.route.padEnd(width)}   ${gz(page.gzip).padStart(9)}   ${gz(page.budget.maxGzip).padStart(9)}   ${deferred.padStart(9)}`
    console.log(page.gzip > page.budget.maxGzip ? `${line}  ✗` : line)
  }
  console.log(
    '\nDIFFERITO = raggiungibile solo da `await import()` (caricato dopo il primo paint, dietro una guardia a runtime).',
  )
}

function printCss({ groups }: CssMeasure, cssMaxGzip: number, width: number): void {
  console.log('\nCSS per rotta (blocca il rendering: gzip dei fogli che la rotta collega)')
  for (const { stylesheets, gzip, routes } of groups) {
    const count = routes.length === 0 ? 'da solo' : routeCount(routes.length)
    const line = `  ${stylesheets.join(' + ').padEnd(width - 2)}   ${gz(gzip).padStart(9)}   ${gz(cssMaxGzip).padStart(9)}   ${count}`
    console.log(gzip > cssMaxGzip ? `${line}  ✗` : line)
  }
  if (groups.some(({ routes }) => routes.length === 0))
    console.log('\nda solo = nessuna rotta misurata collega il foglio: si pesa contro il tetto per conto suo.')
}

function checkCss(pages: readonly PageEntries[], cssMaxGzip: number, width: number): string[] {
  const css = measureCss(pages, readStylesheets(), cssMaxGzip, ASSETS)
  printCss(css, cssMaxGzip, width)
  return css.failures
}

function printSsrNote(expected: Expectations, ssr: SsrReading): void {
  for (const note of ssr.notes) console.log(`\nNOTA  ${note}`)
  if (ssr.measured || expected.ssr.length === 0) return
  console.log(`\nNOTA  ${expected.ssr.length} pagina/e con \`export const prerender = false\`, fuori da questo budget:`)
  for (const file of expected.ssr) console.log(`      - ${file}`)
}

export async function main(): Promise<number> {
  const { bundle = {} } = await loadConfig(process.cwd())
  if (missingInput(ASSETS, 'è la build da misurare: prima `pnpm build`')) return 1
  if (missingInput(PAGES, 'le rotte attese si derivano da lì')) return 1

  const cssMaxGzip = bundle.cssMaxGzip ?? CSS_BUDGET_GZIP

  const html = htmlPages()
  const ssr = readSsr(html.length > 0)
  const routes = [...html, ...ssr.pages]
  const pages = measurePages(routes, readChunks(), bundle.budgets ?? [])
  const expected = expectedRoutes(readPageFiles(PAGES), PAGES)
  const measured = pages.map((page) => page.route)
  const failures = ssr.comparesExpectedRoutes ? missingRouteFailures(expected, measured, DIST) : []
  failures.push(...ssr.failures, ...unknownChunkFailures(pages), ...overBudgetFailures(pages))

  const width = Math.max('ROTTA'.length, ...pages.map((p) => p.route.length))
  printPages(pages, width)
  failures.push(...checkCss(routes, cssMaxGzip, width))
  printSsrNote(expected, ssr)

  if (failures.length > 0) {
    console.error(`\n✗ Budget di bundle:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`)
    return 1
  }
  console.log(
    ssr.comparesExpectedRoutes
      ? '\n✓ Budget di bundle rispettato su ogni rotta attesa.\n'
      : '\n✓ Budget del CSS rispettato; le rotte non sono state misurate.\n',
  )
  return 0
}

if (import.meta.main) process.exit(await main())
