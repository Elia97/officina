#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

import {
  dependencyGaps,
  leftoverGaps,
  type Manifest,
  type ProjectFiles,
  presetGaps,
  scriptGaps,
} from '../lib/alignment.ts'
import { anchorGaps } from '../lib/anchors.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import { findConfigFile, loadConfig, type OfficinaConfig } from '../lib/config.ts'
import { configGaps } from '../lib/config-gaps.ts'
import { type ContractGap, contractGaps } from '../lib/contract.ts'
import { trackedAndUntracked } from '../lib/git.ts'
import { expectedRoutes, missingRepresentatives, readPageFiles } from '../lib/routes.ts'
import { toolingGaps } from '../lib/tooling.ts'
import { packageVersion } from '../lib/versions.ts'
import { dependabotGaps, workflowGaps } from '../lib/workflows.ts'

const PAGES = 'src/pages'

function projectFiles(root: string): ProjectFiles {
  return {
    paths: trackedAndUntracked(),
    read: (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : undefined),
  }
}

function readManifest(files: ProjectFiles): Manifest {
  try {
    return JSON.parse(files.read('package.json') ?? '{}') as Manifest
  } catch {
    return {}
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

function orphanPatterns(root: string, config: OfficinaConfig | Error | undefined): string[] {
  const pages = join(root, PAGES)
  if (!existsSync(pages) || config === undefined || config instanceof Error) return []
  return missingRepresentatives(expectedRoutes(readPageFiles(pages), pages), config.routes?.representatives)
}

export async function main(): Promise<number> {
  const root = process.cwd()
  const files = projectFiles(root)
  const manifest = readManifest(files)
  const version = packageVersion()
  const config = await loadedConfig(root)

  const sections: [title: string, gaps: ContractGap[]][] = [
    ['punti di aggancio dei generatori', contractGaps(root)],
    ['ancoraggi delle pagine a sezioni e dei dizionari', anchorGaps(root)],
    [
      'script, dipendenze e strumenti di package.json',
      [...scriptGaps(manifest), ...dependencyGaps(manifest), ...toolingGaps(manifest)],
    ],
    ['residui di ciò che è uscito dal repository', leftoverGaps(files)],
    ['preset di configurazione', presetGaps(files)],
    ['workflow di GitHub e Dependabot', [...workflowGaps(files, version), ...dependabotGaps(files)]],
    ['officina.config.ts', configGaps(config, orphanPatterns(root, config))],
  ]

  console.log(`\nofficina doctor ${version} — cosa manca al progetto per prendere tutto da fuori\n`)
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
