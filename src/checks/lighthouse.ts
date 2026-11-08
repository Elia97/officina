#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { missingInput } from '../lib/cli.ts'
import { loadConfig } from '../lib/config.ts'
import { baseUrlArg, type LighthouseRc, lighthouseConfig, seoAssertions } from '../lib/lighthouse.ts'
import { noindexInBuild, noindexOnSite } from '../lib/lighthouse-noindex.ts'
import { auditRoutes, expectedRoutes, readPageFiles } from '../lib/routes.ts'

const PAGES_DIR = 'src/pages'
const RC_FILE = '.lighthouserc.json'
const HTML_DIR = 'dist/client'

// Build equivalente alla produzione, server statico e Chrome di Linux: lo script chiama di nuovo
// questo comando, senza `--local`, quando il server risponde.
function runLocal(): number {
  const script = fileURLToPath(new URL('../sh/lhci-local.sh', import.meta.url))
  const env = { ...process.env, OFFICINA_BIN: process.argv[1] }
  return spawnSync('bash', [script], { stdio: 'inherit', env }).status ?? 1
}

type Noindex = { routes: ReadonlySet<string>; note?: string }

async function noindexRoutes(routes: readonly string[], base: string | undefined): Promise<Noindex> {
  if (base !== undefined) return { routes: await noindexOnSite(base, routes) }
  const dir = process.env.LH_HTML_DIR ?? HTML_DIR
  if (existsSync(dir)) return { routes: noindexInBuild(dir, routes) }
  return {
    routes: new Set(),
    note: `${dir} non c'è: le pagine in noindex non si riconoscono, e il SEO resta asserito su ogni URL`,
  }
}

function noindexNote(rc: LighthouseRc, noindex: Noindex): string | undefined {
  if (noindex.routes.size === 0 || seoAssertions(rc.ci.assert) !== null) return noindex.note
  return `le asserzioni di ${RC_FILE} non si dividono per URL (nessuna sul SEO, oppure \`preset\`, \`budgetsFile\` o \`assertMatrix\`): valgono uguali anche per le pagine in noindex`
}

function printUrls(rc: LighthouseRc, routes: readonly string[], urls: readonly string[], noindex: Noindex): void {
  const mark = seoAssertions(rc.ci.assert) === null ? ' — noindex' : " — noindex: misurata, senza l'asserzione sul SEO"
  for (const [index, route] of routes.entries()) console.log(`  ${urls[index]}${noindex.routes.has(route) ? mark : ''}`)
}

async function resolveConfig(url: string | undefined): Promise<LighthouseRc | null> {
  const { routes: configured = {} } = await loadConfig(process.cwd())
  if (missingInput(RC_FILE, 'è la configurazione di Lighthouse CI')) return null
  if (missingInput(PAGES_DIR, 'le rotte da visitare si derivano da lì')) return null

  const rc: LighthouseRc = JSON.parse(readFileSync(RC_FILE, 'utf8'))
  const expected = expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR, configured.disabled)
  const routes = auditRoutes(expected, configured.representatives)
  const env = url === undefined ? process.env : { ...process.env, LH_BASE_URL: url }
  const noindex = await noindexRoutes(routes, env.LH_BASE_URL)
  const resolved = lighthouseConfig(rc, routes, env, noindex.routes)

  const where = url === undefined ? '' : ` su ${url}`
  console.log(`\nLighthouse CI — ${routes.length} rotta/e derivate da ${PAGES_DIR}${where}\n`)
  printUrls(rc, routes, resolved.ci.collect.url ?? [], noindex)
  for (const { label } of expected.disabled) console.log(`  ${label} — spenta da \`routes.disabled\`, non misurata`)
  const note = noindexNote(rc, noindex)
  if (note !== undefined) console.log(`\nNOTA  ${note}`)
  console.log()
  return resolved
}

function autorun(resolved: LighthouseRc): number {
  const dir = mkdtempSync(join(tmpdir(), 'lhci-'))
  const config = join(dir, 'lighthouserc.json')
  writeFileSync(config, JSON.stringify(resolved, null, 2))

  const { status } = spawnSync('pnpm', ['dlx', '@lhci/cli@0.15.1', 'autorun', `--config=${config}`], {
    stdio: 'inherit',
  })
  rmSync(dir, { recursive: true, force: true })

  return status ?? 1
}

export async function main(args: string[] = []): Promise<number> {
  if (args.includes('--local')) return runLocal()

  const { url, error } = baseUrlArg(args)
  if (error !== undefined) {
    console.error(`\n✗ ${error}\n`)
    return 1
  }

  const resolved = await resolveConfig(url)
  return resolved === null ? 1 : autorun(resolved)
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
