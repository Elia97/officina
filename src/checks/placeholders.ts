#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { contactEnvKeys, envFindings, placeholderSources, sourceFindings } from '../lib/check-placeholders.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { loadConfig, type OfficinaConfig } from '../lib/config.ts'

const MISSING_SOURCE = 'sorgente assente: `placeholders.sources` in officina.config.ts dice quali file guardare'

function sourceScan(paths: string[]): Finding[] {
  return paths.flatMap((path): Finding[] => {
    if (!existsSync(path)) return [{ path, message: MISSING_SOURCE, severity: 'error' }]
    return sourceFindings(readFileSync(path, 'utf8')).map((hit): Finding => ({ path, ...hit, severity: 'error' }))
  })
}

function envScan(path: string, keys: readonly string[]): Finding[] {
  if (!existsSync(path))
    return [{ path, message: "file dell'ambiente assente: lo scrive vercel pull", severity: 'error' }]
  return envFindings(readFileSync(path, 'utf8'), keys).map((hit): Finding => ({ path, ...hit, severity: 'error' }))
}

function scan(env: string | undefined, config: OfficinaConfig): { scope: string; findings: Finding[]; fix: string } {
  if (env !== undefined) {
    return {
      scope: `ambiente in ${env}`,
      findings: envScan(env, contactEnvKeys(config)),
      fix: 'docs/guides/deploy-ops.md § Checklist per il go-live',
    }
  }
  const paths = placeholderSources(config)
  return { scope: `${paths.length} sorgenti`, findings: sourceScan(paths), fix: 'README.md § Cosa tocca il rebranding' }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const { env } = parseArgs({ args, options: { env: { type: 'string' } } }).values
  const { scope, findings, fix } = scan(env, await loadConfig(process.cwd()))

  console.log(`\ncheck:placeholders — ${scope}\n`)
  printFindings(findings, cliOptions([]).format)

  if (findings.length === 0) {
    console.log('  Nessun segnaposto del template.\n')
  } else {
    console.log(`\n  Da sostituire prima del deploy: ${fix}.\n`)
  }

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(await main())
