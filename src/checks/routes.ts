#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'

import { findingsFor, isScanned } from '../lib/check-routes.ts'
import { cliOptions, exitCode, type Finding, printFindings, scopedPaths } from '../lib/cli.ts'

// Esporta main ed esegue solo se lanciato direttamente: la copertura non segue i sottoprocessi,
// quindi un gate provato con `node scripts/...` risulterebbe non testato.
export function main(args?: string[]): number {
  const options = cliOptions(args)
  const paths = scopedPaths(options, isScanned)

  const findings: Finding[] = []
  for (const path of paths)
    for (const f of findingsFor(path, readFileSync(path, 'utf8')))
      findings.push({ path, line: f.line, message: f.message, severity: 'error' })

  const scope = options.diff ? ' (solo file toccati dal branch)' : ''
  console.log(`\ncheck:routes — ${paths.length} documenti${scope}\n`)

  printFindings(findings, options.format)

  if (findings.length === 0) {
    console.log('  Ogni rimando risolve.\n')
  } else {
    console.log('\n  Un rimando morto non rompe niente: lo si scopre seguendolo, mesi dopo.\n')
  }

  return exitCode(findings, options.strict)
}

if (import.meta.main) process.exit(main())
