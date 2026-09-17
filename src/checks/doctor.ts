#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import {
  configGaps,
  dependencyGaps,
  leftoverGaps,
  type Manifest,
  type ProjectFiles,
  presetGaps,
  scriptGaps,
  workflowGaps,
} from '../lib/alignment.ts'
import { anchorGaps } from '../lib/anchors.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { findConfigFile, loadConfig, type OfficinaConfig } from '../lib/config.ts'
import { type ContractGap, contractGaps } from '../lib/contract.ts'
import { trackedAndUntracked } from '../lib/git.ts'

function projectFiles(root: string): ProjectFiles {
  return {
    paths: trackedAndUntracked(),
    read: (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined),
  }
}

async function loadedConfig(root: string): Promise<OfficinaConfig | Error | undefined> {
  if (findConfigFile(root) === undefined) return undefined
  try {
    return await loadConfig(root)
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

export async function main(): Promise<number> {
  const root = process.cwd()
  const files = projectFiles(root)
  const manifest: Manifest = JSON.parse(files.read('package.json') ?? '{}')

  const sections: [title: string, gaps: ContractGap[]][] = [
    ['punti di aggancio dei generatori', contractGaps(root)],
    ['ancoraggi delle pagine a sezioni e dei dizionari', anchorGaps(root)],
    ['script e dipendenze di package.json', [...scriptGaps(manifest), ...dependencyGaps(manifest)]],
    ['residui di ciò che è uscito dal repository', leftoverGaps(files)],
    ['preset di configurazione', presetGaps(files)],
    ['workflow di GitHub', workflowGaps(files)],
    ['officina.config.ts', configGaps(await loadedConfig(root))],
  ]

  console.log('\nofficina doctor — cosa manca al progetto per prendere tutto da fuori\n')
  const findings: Finding[] = []
  for (const [title, gaps] of sections) {
    console.log(gaps.length === 0 ? `  ✓ ${title}` : `  ${title}: ${gaps.length}`)
    const sectionFindings = gaps.map((gap): Finding => ({ ...gap, severity: 'error' }))
    printFindings(sectionFindings, cliOptions([]).format)
    findings.push(...sectionFindings)
  }
  console.log(
    findings.length === 0
      ? '\n  Il progetto è allineato: metodo, gate, generatori e verifiche arrivano da fuori.\n'
      : `\n  ${findings.length} da sistemare.\n`,
  )

  return exitCode(findings, false)
}

if (import.meta.main) process.exit(await main())
