#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'

import { isNoisy, report, SCANNED } from '../lib/check-comments.ts'
import { cliOptions, exitCode, type Finding, printFindings, readLines, scopedPaths } from '../lib/cli.ts'

// Esporta main ed esegue solo se lanciato direttamente: la coverage non segue i sottoprocessi,
// quindi un gate provato con `node scripts/...` risulterebbe non testato.
export function main(args?: string[]): number {
  const options = cliOptions(args)
  const paths = scopedPaths(options, (path) => SCANNED.test(path))

  let totalLines = 0
  let totalComments = 0
  const findings: Finding[] = []

  for (const path of paths) {
    const result = report(path, readLines(readFileSync(path, 'utf8')))
    totalLines += result.total
    totalComments += result.comments
    findings.push(
      ...result.findings.map((f) => ({
        path,
        line: f.line,
        message: f.message,
        severity: 'error' as const,
      })),
    )
    if (isNoisy(result))
      findings.push({
        path,
        message: `${result.comments}/${result.total} righe sono commento`,
        severity: 'warning',
      })
  }

  const ratio = totalLines === 0 ? '0.0' : ((totalComments / totalLines) * 100).toFixed(1)
  const scope = options.diff ? ' (solo file toccati dal branch)' : ''
  console.log(`\ncheck:comments — ${totalComments}/${totalLines} righe sono commento (${ratio}%)${scope}\n`)

  printFindings(findings, options.format)

  if (findings.length === 0) {
    console.log('  Niente sopra la soglia.\n')
  } else {
    console.log(
      '\n  Il default è non commentare: solo i casi particolari, al presente, sul codice\n' +
        "  com'è adesso. Casi e forma in metodo.md, nel plugin metodo.\n",
    )
  }

  return exitCode(findings, options.strict)
}

if (import.meta.main) process.exit(main())
