#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { envFindings, placeholderSources, sourceFindings } from '../lib/check-placeholders.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'

function sourceScan(paths: string[]): Finding[] {
  return paths.flatMap((path) =>
    sourceFindings(readFileSync(path, 'utf8')).map((hit): Finding => ({ path, ...hit, severity: 'error' })),
  )
}

function envScan(path: string): Finding[] {
  if (!existsSync(path))
    return [{ path, message: "file dell'ambiente assente: lo scrive vercel pull", severity: 'error' }]
  return envFindings(readFileSync(path, 'utf8')).map((hit): Finding => ({ path, ...hit, severity: 'error' }))
}

function scan(env: string | undefined): { scope: string; findings: Finding[]; fix: string } {
  if (env !== undefined) {
    return {
      scope: `ambiente in ${env}`,
      findings: envScan(env),
      fix: 'docs/guides/deploy-ops.md § Checklist per il go-live',
    }
  }
  const paths = placeholderSources()
  return { scope: `${paths.length} sorgenti`, findings: sourceScan(paths), fix: 'README.md § Cosa tocca il rebranding' }
}

export function main(args: string[] = process.argv.slice(2)): number {
  const { env } = parseArgs({ args, options: { env: { type: 'string' } } }).values
  const { scope, findings, fix } = scan(env)

  console.log(`\ncheck:placeholders — ${scope}\n`)
  printFindings(findings, cliOptions([]).format)

  if (findings.length === 0) {
    console.log('  Nessun segnaposto del template.\n')
  } else {
    console.log(`\n  Da sostituire prima del deploy: ${fix}.\n`)
  }

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(main())
