#!/usr/bin/env node
// L'unico controllo che vede cosa serve davvero il bordo: i test del progetto fissano solo vercel.json.

import process from 'node:process'

import { loadConfig } from '../lib/config.ts'
import { expectedRoutes, readPageFiles, smokeRoutes } from '../lib/routes.ts'
import {
  type CheckResult,
  runChecks,
  SECURITY_HEADERS,
  type SmokeContext,
  waitForAlias,
} from '../lib/smoke-production.ts'

const PAGES_DIR = 'src/pages'

function printResults(results: readonly CheckResult[]): void {
  for (const { check, status, detail } of results) {
    if (status === 'pass') console.log(`✓ ${check}`)
    else if (status === 'skip') console.log(`- ${check} (skipped: ${detail})`)
    else console.error(`✗ ${check} — ${detail}`)
  }
}

function printFailures(failures: readonly CheckResult[]): void {
  console.error(`\n✗ ${failures.length} check(s) failed:`)
  console.error(`${failures.map(({ check, detail }) => `  - ${check} — ${detail}`).join('\n')}\n`)
  console.error('Production is live and broken. Roll back from the Vercel dashboard:')
  console.error('Deployments → the last known-good production deployment → Promote to Production.\n')
}

export async function main(args: string[] = []): Promise<number> {
  const { siteUrl, smoke = {} } = await loadConfig(process.cwd())
  const [url] = args

  if (siteUrl === undefined) {
    console.error(
      '\n✗ officina.config.ts declares no siteUrl — the canonical-host check has nothing to compare against.\n',
    )
    return 1
  }
  if (url === undefined && new URL(siteUrl).host === 'example.com') {
    console.error('\n✗ siteUrl is still the template placeholder — pass a URL: pnpm smoke:prod https://…\n')
    return 1
  }

  // L'apice, non l'URL *.vercel.app che stampa `vercel deploy`: lì la regola `has: host` di vercel.json mette noindex.
  const baseUrl = (url ?? siteUrl).replace(/\/+$/, '')
  const context: SmokeContext = {
    get: (target) => fetch(target, { redirect: 'manual' }),
    baseUrl,
    siteUrl,
    securityHeaders: smoke.securityHeaders ?? SECURITY_HEADERS,
  }
  const pages = smokeRoutes(expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR), smoke.nonHtmlRoutes)

  console.log(`\nProduction smoke — ${baseUrl}\n`)

  await waitForAlias(context, (ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const results = await runChecks(context, pages, smoke.checks)
  printResults(results)

  const failures = results.filter(({ status }) => status === 'fail')
  if (failures.length > 0) {
    printFailures(failures)
    return 1
  }
  console.log(`\n✓ Every check passed on ${baseUrl}.\n`)
  return 0
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
