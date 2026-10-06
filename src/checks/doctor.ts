#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { PROJECT_GENERATORS } from '../gen/plopfile.mjs'
import {
  dependencyGaps,
  leftoverGaps,
  type Manifest,
  type ProjectFiles,
  presetGaps,
  readManifest,
  scriptGaps,
} from '../lib/alignment.ts'
import { anchorGaps } from '../lib/anchors.ts'
import { cliOptions, exitCode, type Finding, printFindings } from '../lib/cli.ts'
import {
  featuresOffByChoice,
  featuresOn,
  findConfigFile,
  type GeneratorsSetting,
  generatorsSetting,
  loadConfig,
  type OfficinaConfig,
} from '../lib/config.ts'
import { configGaps, type RouteGaps } from '../lib/config-gaps.ts'
import { type ContractGap, contractGaps } from '../lib/contract.ts'
import { databaseAuthGaps } from '../lib/database-auth.ts'
import { dependabotGaps } from '../lib/dependabot.ts'
import { trackedAndUntracked } from '../lib/git.ts'
import { expectedRoutes, missingRepresentatives, readPageFiles, unknownDisabled } from '../lib/routes.ts'
import { toolingGaps } from '../lib/tooling.ts'
import { packageVersion } from '../lib/versions.ts'
import { workflowGaps } from '../lib/workflows.ts'

const PAGES = 'src/pages'

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

type Section = { title: string; gaps: ContractGap[]; notes?: readonly string[] } | { title: string; off: string }

const HOOK_POINTS = 'punti di aggancio dei generatori'
const ANCHORS = 'ancoraggi delle pagine a sezioni e dei dizionari'

const usable = (config: OfficinaConfig | Error | undefined): OfficinaConfig =>
  config === undefined || config instanceof Error ? {} : config

function generatorSections(root: string, setting: GeneratorsSetting): Section[] {
  if (setting === 'required') {
    return [
      { title: HOOK_POINTS, gaps: contractGaps(root) },
      { title: ANCHORS, gaps: anchorGaps(root) },
    ]
  }
  const off = `\`features.generators: ${setting === false ? 'false' : "'project'"}\``
  if (setting === false)
    return [
      { title: HOOK_POINTS, off },
      { title: ANCHORS, off },
    ]
  const missing = existsSync(join(root, PROJECT_GENERATORS))
    ? []
    : [{ path: PROJECT_GENERATORS, message: "manca: con `generators: 'project'` i generatori sono i suoi" }]
  return [
    { title: HOOK_POINTS, gaps: missing },
    { title: ANCHORS, off },
  ]
}

function routeGaps(root: string, config: OfficinaConfig | Error | undefined): RouteGaps & { disabled: string[] } {
  if (config === undefined || config instanceof Error) return { disabled: [] }
  const pages = join(root, PAGES)
  const { representatives, disabled: declared } = config.routes ?? {}
  const expected = expectedRoutes(existsSync(pages) ? readPageFiles(pages) : [], pages, declared)
  return {
    missingRepresentatives: missingRepresentatives(expected, representatives),
    unknownDisabled: unknownDisabled(expected, declared),
    disabled: expected.disabled.map(({ label }) => label),
  }
}

function configSection(root: string, config: OfficinaConfig | Error | undefined): Section {
  const { disabled, ...gaps } = routeGaps(root, config)
  const notes = disabled.length === 0 ? [] : [`spente da \`routes.disabled\`: ${disabled.join(', ')}`]
  return { title: 'officina.config.ts', gaps: configGaps(config, gaps), notes }
}

const DATABASE_AUTH = 'database e autenticazione'

function databaseAuthSections(files: ProjectFiles, config: OfficinaConfig, manifest: Manifest): Section[] {
  const on = featuresOn(config, manifest)
  const off = featuresOffByChoice(config, manifest).map((name) => `\`features.${name}: false\``)
  if (on.length === 0) return off.length === 0 ? [] : [{ title: DATABASE_AUTH, off: off.join(' e ') }]
  const notes = off.map((setting) => `spenta da ${setting}`)
  return [{ title: DATABASE_AUTH, gaps: databaseAuthGaps(files, manifest, on), notes }]
}

export async function main(): Promise<number> {
  const root = process.cwd()
  const files = projectFiles(root)
  const manifest = readManifest(files)
  const version = packageVersion()
  const config = await loadedConfig(root)

  const sections: Section[] = [
    ...generatorSections(root, generatorsSetting(usable(config))),
    {
      title: 'script, dipendenze e strumenti di package.json',
      gaps: [...scriptGaps(manifest), ...dependencyGaps(manifest), ...toolingGaps(manifest)],
    },
    { title: 'residui di ciò che è uscito dal repository', gaps: leftoverGaps(files) },
    { title: 'preset di configurazione', gaps: presetGaps(files) },
    {
      title: 'workflow di GitHub e Dependabot',
      gaps: [...workflowGaps(files, version), ...dependabotGaps(files)],
    },
    configSection(root, config),
    ...databaseAuthSections(files, usable(config), manifest),
  ]

  console.log(`\nofficina doctor ${version} — cosa manca al progetto per prendere tutto da fuori\n`)
  const findings: Finding[] = []
  for (const section of sections) {
    if ('off' in section) {
      console.log(`  · ${section.title} — spento da ${section.off}`)
      continue
    }
    const { title, gaps } = section
    console.log(gaps.length === 0 ? `  ✓ ${title}` : `  ${title}: ${gaps.length}`)
    const sectionFindings = gaps.map((gap): Finding => ({ ...gap, severity: gap.severity ?? 'error' }))
    printFindings(sectionFindings, cliOptions([]).format)
    for (const note of section.notes ?? []) console.log(`    · ${note}`)
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
