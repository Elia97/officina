#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import { findingsFor } from '../lib/check-roadmap.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'

const ROADMAP = 'docs/ROADMAP.md'

// Esporta main ed esegue solo se lanciato direttamente: la copertura non segue i sottoprocessi,
// quindi un gate provato con `node scripts/...` risulterebbe non testato.
export function main(args?: string[]): number {
  const options = cliOptions(args)

  // Un progetto appena creato dal template può non averla ancora scritta.
  if (!existsSync(ROADMAP)) {
    console.log(`\ncheck:roadmap — ${ROADMAP} non c'è ancora\n`)
    return 0
  }

  const findings: Finding[] = findingsFor(readFileSync(ROADMAP, 'utf8')).map((f) => ({
    path: ROADMAP,
    line: f.line,
    message: f.message,
    severity: 'error',
  }))

  console.log(`\ncheck:roadmap — le giornate dette in due posti\n`)

  printFindings(findings, options.format)

  if (findings.length === 0) {
    console.log('  Tabella e sezioni concordano.\n')
  } else {
    console.log('\n  Le giornate sono la fonte contrattuale: due numeri diversi sono uno sbagliato.\n')
  }

  return exitCode(findings, options.strict)
}

if (import.meta.main) process.exit(main())
