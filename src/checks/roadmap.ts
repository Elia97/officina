#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import { findingsFor } from '../lib/check-roadmap.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { isRequired, loadConfig } from '../lib/config.ts'

const ROADMAP = 'docs/ROADMAP.md'

// Esporta main ed esegue solo se lanciato direttamente: la copertura non segue i sottoprocessi,
// quindi un gate provato con `node scripts/...` risulterebbe non testato.
export async function main(args?: string[]): Promise<number> {
  const options = cliOptions(args)

  // Che un progetto la roadmap non ce l'abbia è una scelta, e una scelta si dichiara: il silenzio
  // vale `'required'`, e un gate che esce 0 su un file che non c'è non afferma niente.
  if (!existsSync(ROADMAP)) {
    if (!isRequired(await loadConfig(process.cwd()), 'roadmap')) {
      console.log(`\ncheck:roadmap — spento da \`features.roadmap: false\`\n`)
      return 0
    }
    console.error(`\n✗ check:roadmap — ${ROADMAP} non c'è: scrivila, o dichiara \`features.roadmap: false\`\n`)
    return 1
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

if (import.meta.main) process.exit(await main())
