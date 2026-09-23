#!/usr/bin/env node
// L'unico controllo che vede cosa serve davvero il bordo: i test del progetto fissano solo vercel.json.

import process from 'node:process'

import { missingInput } from '../lib/cli.ts'
import { isRequired, loadConfig } from '../lib/config.ts'
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
    else if (status === 'skip') console.log(`- ${check} (saltato: ${detail})`)
    else console.error(`✗ ${check} — ${detail}`)
  }
}

function printFailures(failures: readonly CheckResult[]): void {
  console.error(`\n✗ ${failures.length} controllo/i falliti:`)
  console.error(`${failures.map(({ check, detail }) => `  - ${check} — ${detail}`).join('\n')}\n`)
  console.error('La produzione è online e rotta. Torna indietro dalla dashboard di Vercel:')
  console.error('Deployments → l’ultimo deployment di produzione sano → Promote to Production.\n')
}

export async function main(args: string[] = []): Promise<number> {
  const config = await loadConfig(process.cwd())
  const { siteUrl, smoke = {}, routes = {} } = config
  const [url] = args

  if (siteUrl === undefined) {
    console.error(
      '\n✗ officina.config.ts non dichiara siteUrl: il controllo dell’host canonico non ha con cosa confrontarsi.\n',
    )
    return 1
  }
  if (url === undefined && new URL(siteUrl).host === 'example.com') {
    console.error('\n✗ siteUrl è ancora il segnaposto del template: passa un URL, pnpm smoke:prod https://…\n')
    return 1
  }

  // L'apice, non l'URL *.vercel.app che stampa `vercel deploy`: lì la regola `has: host` di vercel.json mette noindex.
  const baseUrl = (url ?? siteUrl).replace(/\/+$/, '')
  const context: SmokeContext = {
    get: (target) => fetch(target, { redirect: 'manual' }),
    baseUrl,
    siteUrl,
    securityHeaders: smoke.securityHeaders ?? SECURITY_HEADERS,
    botIdRequired: isRequired(config, 'botId'),
  }
  if (missingInput(PAGES_DIR, 'le rotte da visitare si derivano da lì')) return 1

  const expected = expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR)
  const pages = smokeRoutes(expected, smoke.nonHtmlRoutes, routes.representatives)

  console.log(`\nSmoke di produzione — ${baseUrl}\n`)

  await waitForAlias(context, (ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const results = await runChecks(context, pages, smoke.checks)
  printResults(results)

  const failures = results.filter(({ status }) => status === 'fail')
  if (failures.length > 0) {
    printFailures(failures)
    return 1
  }
  console.log(`\n✓ Tutti i controlli passati su ${baseUrl}.\n`)
  return 0
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
