#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  contactEnvKeys,
  envFindings,
  outputFindings,
  placeholderSources,
  sourceFindings,
} from '../lib/check-placeholders.ts'
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
  return envFindings(readFileSync(path, 'utf8'), keys).map((hit): Finding => ({ path, ...hit }))
}

function outputScan(dir: string): Finding[] {
  if (!existsSync(dir))
    return [{ path: dir, message: 'cartella della build assente: la scrive vercel build', severity: 'error' }]
  return outputFindings(dir)
}

interface Scan {
  scope: string
  findings: Finding[]
  clean: string
  advice: string
}

function scan(env: string | undefined, output: string | undefined, config: OfficinaConfig): Scan {
  if (output !== undefined) {
    return {
      scope: `build in ${output}`,
      findings: outputScan(output),
      clean: 'Nessuna variabile Sensitive entrata nella build.',
      advice:
        'Una variabile che la build legge non può essere Sensitive su Vercel: portala a Encrypted, o leggila a runtime',
    }
  }
  if (env !== undefined) {
    return {
      scope: `ambiente in ${env}`,
      findings: envScan(env, contactEnvKeys(config)),
      clean: 'Nessun segnaposto del template.',
      advice: 'Da sostituire prima del deploy: docs/guides/deploy-ops.md § Checklist per il go-live',
    }
  }
  const paths = placeholderSources(config)
  return {
    scope: `${paths.length} sorgenti`,
    findings: sourceScan(paths),
    clean: 'Nessun segnaposto del template.',
    advice: 'Da sostituire prima del deploy: README.md § Cosa tocca il rebranding',
  }
}

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const { env, output } = parseArgs({ args, options: { env: { type: 'string' }, output: { type: 'string' } } }).values
  const { scope, findings, clean, advice } = scan(env, output, await loadConfig(process.cwd()))

  console.log(`\ncheck:placeholders — ${scope}\n`)
  printFindings(findings, cliOptions([]).format)

  if (findings.length === 0) console.log(`  ${clean}\n`)
  else if (findings.some(({ severity }) => severity === 'error')) console.log(`\n  ${advice}.\n`)

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(await main())
