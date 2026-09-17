#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { type LighthouseRc, lighthouseConfig } from '../lib/lighthouse.ts'
import { auditRoutes, expectedRoutes, readPageFiles } from '../lib/routes.ts'

const PAGES_DIR = 'src/pages'
const RC_FILE = '.lighthouserc.json'

// Build equivalente alla produzione, server statico e Chrome di Linux: lo script chiama di nuovo
// questo comando, senza `--local`, quando il server risponde.
function runLocal(): number {
  const script = fileURLToPath(new URL('../sh/lhci-local.sh', import.meta.url))
  const env = { ...process.env, OFFICINA_BIN: process.argv[1] }
  return spawnSync('bash', [script], { stdio: 'inherit', env }).status ?? 1
}

export function main(args: string[] = []): number {
  if (args.includes('--local')) return runLocal()

  const rc: LighthouseRc = JSON.parse(readFileSync(RC_FILE, 'utf8'))
  const routes = auditRoutes(expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR))
  const resolved = lighthouseConfig(rc, routes, process.env)

  console.log(`\nLighthouse CI — ${routes.length} rotta/e derivate da ${PAGES_DIR}\n`)
  for (const url of resolved.ci.collect.url ?? []) console.log(`  ${url}`)
  console.log()

  const dir = mkdtempSync(join(tmpdir(), 'lhci-'))
  const config = join(dir, 'lighthouserc.json')
  writeFileSync(config, JSON.stringify(resolved, null, 2))

  const { status } = spawnSync('pnpm', ['dlx', '@lhci/cli', 'autorun', `--config=${config}`], { stdio: 'inherit' })
  rmSync(dir, { recursive: true, force: true })

  return status ?? 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
