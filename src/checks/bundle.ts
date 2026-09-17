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

type MeasuredPage = { route: string; gzip: number; deferredGzip: number; budget: Budget }

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
      const reached = staticClosure(htmlEntries(readFileSync(htmlPath, 'utf8')), chunks)
      return {
        route,
        gzip: total(reached),
        deferredGzip: total(deferredClosure(reached, chunks)),
        budget: budgetFor(route, budgets),
      }
    })
    .sort((a, b) => b.gzip - a.gzip)
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
  console.log('\nBundle budget — client JS per route (gzip, static closure)\n')
  console.log(
    `${'ROUTE'.padEnd(width)}   ${'STATIC'.padStart(9)}   ${'BUDGET'.padStart(9)}   ${'DEFERRED'.padStart(9)}`,
  )
  for (const page of pages) {
    const deferred = page.deferredGzip > 0 ? gz(page.deferredGzip) : '—'
    const line = `${page.route.padEnd(width)}   ${gz(page.gzip).padStart(9)}   ${gz(page.budget.maxGzip).padStart(9)}   ${deferred.padStart(9)}`
    console.log(page.gzip > page.budget.maxGzip ? `${line}  ✗` : line)
  }
  console.log('\nDEFERRED = reachable only through `await import()` (loaded after paint, behind a runtime guard).')
}

function printStylesheets(
  stylesheets: readonly Stylesheet[],
  cssMaxGzip: number,
  failed: boolean,
  width: number,
): void {
  const worst = heaviestStylesheet(stylesheets)
  console.log(`\nCSS (render-blocking, heaviest sheet a route links)`)
  for (const sheet of [...stylesheets].sort((a, b) => b.gzip - a.gzip)) {
    const mark = sheet === worst && failed ? '  ✗' : ''
    console.log(
      `  ${sheet.file.padEnd(width - 2)}   ${gz(sheet.gzip).padStart(9)}   ${gz(cssMaxGzip).padStart(9)}${mark}`,
    )
  }
}

function printSsrNote(expected: Expectations): void {
  if (expected.ssr.length === 0) return
  console.log(
    `\nNOTE  ${expected.ssr.length} page(s) opted out with \`export const prerender = false\` and are outside this budget:`,
  )
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
  failures.push(...overBudgetFailures(pages))

  const width = Math.max('ROUTE'.length, ...pages.map((p) => p.route.length))
  printPages(pages, width)

  const stylesheets = readStylesheets()
  const cssFailure = cssBudgetFailure(stylesheets, cssMaxGzip)
  if (cssFailure) failures.push(cssFailure)
  printStylesheets(stylesheets, cssMaxGzip, cssFailure !== null, width)
  printSsrNote(expected)

  if (failures.length > 0) {
    console.error(`\n✗ Bundle budget:\n${failures.map((f) => `  - ${f}`).join('\n')}\n`)
    return 1
  }
  console.log('\n✓ Bundle budget respected on every expected route.\n')
  return 0
}

if (import.meta.main) process.exit(await main())
