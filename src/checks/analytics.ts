#!/usr/bin/env node
// Il container GTM vivo scatta sugli eventi che questo sito emette? Legge il gtm.js pubblico
// del container: nessuna credenziale, niente da scrivere.

import { readFileSync } from 'node:fs'
import process from 'node:process'

import { type Coverage, coverageOf, extractLinkEvents } from '../lib/analytics-coverage.ts'
import { loadConfig } from '../lib/config.ts'
import { extractTriggers, googleTagIds, parseContainerData } from '../lib/gtm-container.ts'

const LINK_TRACKING = 'src/lib/analytics/link-tracking.ts'
const TIMEOUT_MS = 15_000

function resolveGtmId(args: string[]): string | null {
  const gtmId = args[0] ?? process.env.PUBLIC_GTM_ID ?? ''
  return /^GTM-[A-Z0-9]+$/.test(gtmId) ? gtmId : null
}

function reportCoverage(coverage: readonly Coverage[]): number {
  for (const { event, prefix, covered } of coverage) {
    console.log(`  ${covered ? '✓' : '✗'} ${event.padEnd(16)} (${prefix})`)
  }

  const missing = coverage.filter(({ covered }) => !covered)
  if (missing.length > 0) {
    console.error(`\n✗ ${missing.length} evento/i che il sito emette e nessun trigger ascolta.`)
    return 1
  }
  console.log('\n✓ Ogni evento che il sito emette ha un trigger.')
  return 0
}

export async function main(args: string[] = []): Promise<number> {
  const { analytics = {} } = await loadConfig(process.cwd())
  const gtmId = resolveGtmId(args)
  if (gtmId === null) {
    console.log('Nessun container GTM da controllare: passane uno come argomento o imposta PUBLIC_GTM_ID.')
    return 0
  }

  const response = await fetch(`https://www.googletagmanager.com/gtm.js?id=${gtmId}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) {
    console.error(`✗ container ${gtmId} illeggibile: HTTP ${response.status}`)
    return 1
  }

  const container = parseContainerData(await response.text())
  const source = readFileSync(analytics.linkTracking ?? LINK_TRACKING, 'utf8')
  const coverage = coverageOf(extractLinkEvents(source), extractTriggers(container))

  console.log(`\nGTM ${gtmId} — ID di misurazione: ${googleTagIds(container).join(', ') || '—'}\n`)
  return reportCoverage(coverage)
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
