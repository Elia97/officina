#!/usr/bin/env node
// Gate del budget di bundle su dist/client — richiede un `astro build` completato.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'

import {
  type Budget,
  budgetFor,
  type Chunk,
  CSS_BUDGET_GZIP,
  cssBudgetFailure,
  deferredClosure,
  heaviestStylesheet,
  htmlEntries,
  parseEdges,
  type Stylesheet,
  staticClosure,
} from '../lib/bundle-budget.ts'
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
  return readdirSync(ASSETS)
    .filter((f) => f.endsWith('.css'))
    .map((file) => ({ file, gzip: gzipSync(readFileSync(join(ASSETS, file))).length }))
}

function readChunks(): Map<string, Chunk> {
  const chunks = new Map<string, Chunk>()
  for (const name of readdirSync(ASSETS).filter((f) => f.endsWith('.js'))) {
    const raw = readFileSync(join(ASSETS, name))
    chunks.set(name, { gzip: gzipSync(raw).length, ...parseEdges(raw.toString('utf8')) })
  }
  return chunks
}

function measurePages(chunks: Map<string, Chunk>, budgets: readonly Budget[]): MeasuredPage[] {
  const total = (names: Set<string>) => [...names].reduce((sum, name) => sum + (chunks.get(name)?.gzip ?? 0), 0)
  return filesWithExtension(DIST, '.html')
    .map((htmlPath) => {
      const route = routeOf(htmlPath, DIST)
      const { reached, unknown } = staticClosure(htmlEntries(readFileSync(htmlPath, 'utf8')), chunks)
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

function printStylesheets(
  stylesheets: readonly Stylesheet[],
  cssMaxGzip: number,
  failed: boolean,
  width: number,
): void {
  const worst = heaviestStylesheet(stylesheets)
  console.log(`\nCSS (blocca il rendering: il foglio più pesante che una rotta collega)`)
  for (const sheet of [...stylesheets].sort((a, b) => b.gzip - a.gzip)) {
    const mark = sheet === worst && failed ? '  ✗' : ''
    console.log(
      `  ${sheet.file.padEnd(width - 2)}   ${gz(sheet.gzip).padStart(9)}   ${gz(cssMaxGzip).padStart(9)}${mark}`,
    )
  }
}

function printSsrNote(expected: Expectations): void {
  if (expected.ssr.length === 0) return
  console.log(`\nNOTA  ${expected.ssr.length} pagina/e con \`export const prerender = false\`, fuori da questo budget:`)
  for (const file of expected.ssr) console.log(`      - ${file}`)
}

export async function main(): Promise<number> {
  const { bundle = {} } = await loadConfig(process.cwd())
  const cssMaxGzip = bundle.cssMaxGzip ?? CSS_BUDGET_GZIP

  const pages = measurePages(readChunks(), bundle.budgets ?? [])
  const expected = expectedRoutes(readPageFiles(PAGES), PAGES)
  const failures = missingRouteFailures(
    expected,
    pages.map((page) => page.route),
    DIST,
  )
  failures.push(...unknownChunkFailures(pages), ...overBudgetFailures(pages))

  const width = Math.max('ROTTA'.length, ...pages.map((p) => p.route.length))
  printPages(pages, width)

  const stylesheets = readStylesheets()
  const cssFailure = cssBudgetFailure(stylesheets, cssMaxGzip)
  if (cssFailure) failures.push(cssFailure)
  printStylesheets(stylesheets, cssMaxGzip, cssFailure !== null, width)
  printSsrNote(expected)

  if (failures.length > 0) {
    console.error(`\n✗ Budget di bundle:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`)
    return 1
  }
  console.log('\n✓ Budget di bundle rispettato su ogni rotta attesa.\n')
  return 0
}

if (import.meta.main) process.exit(await main())
