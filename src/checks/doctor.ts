#!/usr/bin/env node
import process from 'node:process'

import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { CONTRACT, contractGaps } from '../lib/contract.ts'

export function main(): number {
  const findings: Finding[] = contractGaps(process.cwd()).map((gap) => ({ ...gap, severity: 'error' }))

  console.log(`\nofficina doctor — ${CONTRACT.length} punti di aggancio dei generatori\n`)
  printFindings(findings, cliOptions([]).format)
  console.log(
    findings.length === 0
      ? '  Il progetto ha tutto quello che i generatori si aspettano.\n'
      : `\n  ${findings.length} su ${CONTRACT.length} da sistemare prima che \`officina gen\` scriva codice che compila.\n`,
  )

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(main())
