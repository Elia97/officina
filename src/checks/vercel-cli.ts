#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'

import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { pinFindings } from '../lib/vercel-cli-pin.ts'

const DEFAULT_WORKFLOW = '.github/workflows/deploy.yml'
// Il documento `latest` porta la sola versione pubblicata; quello del pacchetto intero pesa 8 MB.
const REGISTRY = 'https://registry.npmjs.org/vercel/latest'
const TIMEOUT_MS = 15_000

// Il file è un argomento perché officina controlla il pin della propria action di deploy.
export async function main(args: string[] = []): Promise<number> {
  const workflow = args[0] ?? DEFAULT_WORKFLOW
  const response = await fetch(REGISTRY, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) {
    console.error(`✗ registry npm illeggibile: HTTP ${response.status}`)
    return 1
  }

  const { version } = (await response.json()) as { version: string }
  const findings: Finding[] = pinFindings(readFileSync(workflow, 'utf8'), version).map((hit) => ({
    path: workflow,
    ...hit,
    severity: 'error',
  }))

  console.log(`\ncheck:vercel-cli — il pin contro la ${version} pubblicata su npm\n`)
  printFindings(findings, cliOptions([]).format)
  console.log(
    findings.length === 0
      ? '  Il pin è sulla major pubblicata.\n'
      : `\n  Alza il pin in ${workflow} e allinea la CLI locale alla stessa major.\n`,
  )

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(await main(process.argv.slice(2)))
