#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { type PinSite, pinFindings } from '../lib/pins.ts'

// I pin di ciò che si scarica al volo stanno nei file di questo repository: un progetto prende
// `vercel` dall'action di deploy e `@lhci/cli` dal gate, e non ne pinna nessuno per conto suo.
const PINNED: readonly { package: string; files: readonly [string, ...string[]] }[] = [
  { package: 'vercel', files: ['actions/deploy/action.yml'] },
  { package: '@lhci/cli', files: ['src/checks/lighthouse.ts'] },
]

// Il documento `latest` porta la sola versione pubblicata; quello del pacchetto intero pesa 8 MB.
const REGISTRY = 'https://registry.npmjs.org'
const TIMEOUT_MS = 15_000

const read = (path: string): PinSite => ({ path, source: existsSync(path) ? readFileSync(path, 'utf8') : '' })

async function latestOf(pkg: string): Promise<string | undefined> {
  const response = await fetch(`${REGISTRY}/${pkg.replace('/', '%2f')}/latest`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!response.ok) return undefined
  const { version } = (await response.json()) as { version: string }
  return version
}

export async function main(): Promise<number> {
  const findings: Finding[] = []
  const published: string[] = []

  for (const { package: pkg, files } of PINNED) {
    const latest = await latestOf(pkg)
    if (latest === undefined) {
      findings.push({ path: files[0], message: `registry npm illeggibile per \`${pkg}\``, severity: 'error' })
      continue
    }
    published.push(`${pkg}@${latest}`)
    const sites: readonly [PinSite, ...PinSite[]] = [read(files[0]), ...files.slice(1).map(read)]
    findings.push(...pinFindings(pkg, latest, sites).map((hit): Finding => ({ ...hit, severity: 'error' })))
  }

  console.log(`\ncheck:vercel-cli — i pin contro quello che npm pubblica (${published.join(', ')})\n`)
  printFindings(findings, cliOptions([]).format)
  console.log(
    findings.length === 0
      ? '  Ogni pin è esatto e sulla major pubblicata.\n'
      : '\n  Alza i pin e allinea la CLI locale alla stessa versione.\n',
  )

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(await main())
