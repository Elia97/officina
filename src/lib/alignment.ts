import type { ContractGap } from './contract.ts'
import { mentions } from './workflows.ts'

// Oltre agli agganci dei generatori: ciò che dice che un progetto prende metodo, gate, generatori
// e verifiche da fuori, senza una copia propria rimasta indietro.
export interface ProjectFiles {
  /** Tracciati e non tracciati, senza gli ignorati: un file locale fuori da git non è un residuo. */
  paths: readonly string[]
  read: (path: string) => string | undefined
}

export interface Manifest {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

export const EXPECTED_SCRIPTS: Readonly<Record<string, string>> = {
  'check:comments': 'officina check comments',
  'check:language': 'officina check language',
  'check:routes': 'officina check routes',
  'check:roadmap': 'officina check roadmap',
  'check:placeholders': 'officina check placeholders',
  'perf:bundle': 'officina check bundle',
  'smoke:prod': 'officina check smoke',
  'analytics:verify': 'officina check analytics',
  lhci: 'officina check lighthouse',
  'lhci:local': 'officina check lighthouse --local',
  doctor: 'officina doctor',
  gen: 'officina gen',
  'gen:section': 'officina gen section',
  'gen:page': 'officina gen page',
  'gen:component': 'officina gen component',
  'gen:collection': 'officina gen collection',
  'gen:icons': 'officina gen icons',
}

export const CI_STEPS: readonly string[] = [
  'check:language',
  'check:routes',
  'check:roadmap',
  'check:comments',
  'doctor',
]

const MANIFEST = 'package.json'

export function scriptGaps({ scripts = {} }: Manifest): ContractGap[] {
  const gaps: ContractGap[] = []
  for (const [name, expected] of Object.entries(EXPECTED_SCRIPTS)) {
    const actual = scripts[name]
    if (actual === undefined)
      gaps.push({ path: MANIFEST, message: `script \`${name}\` assente: atteso \`${expected}\`` })
    else if (!actual.startsWith(expected))
      gaps.push({ path: MANIFEST, message: `script \`${name}\` è \`${actual}\`: atteso \`${expected}\`` })
  }
  const ci = scripts.ci ?? ''
  for (const step of CI_STEPS) {
    if (!ci.includes(`pnpm run ${step}`)) gaps.push({ path: MANIFEST, message: `script \`ci\` non lancia \`${step}\`` })
  }
  return gaps
}

const RETIRED_DEPENDENCIES: readonly string[] = ['plop', 'ts-morph']

export function dependencyGaps({ dependencies = {}, devDependencies = {} }: Manifest): ContractGap[] {
  const declared = { ...dependencies, ...devDependencies }
  const gaps: ContractGap[] = RETIRED_DEPENDENCIES.filter((name) => name in declared).map((name) => ({
    path: MANIFEST,
    message: `\`${name}\` non serve più al progetto: è una dipendenza di officina`,
  }))
  if (!('@elia97/officina' in devDependencies)) {
    gaps.push({ path: MANIFEST, message: '`@elia97/officina` non è fra le devDependencies' })
  }
  return gaps
}

const FROM_PLUGIN = 'arriva dal plugin `metodo`'
const FROM_PACKAGE = 'arriva da officina'
const OUT_OF_REPOSITORY = 'sta nella cartella del progetto, fuori dal repository'

// Una cartella si nomina con la barra finale: corrisponde a qualunque file sotto di lei.
const LEFTOVERS: readonly { path: string; reason: string }[] = [
  { path: '.claude/agents/', reason: FROM_PLUGIN },
  { path: '.claude/commands/', reason: FROM_PLUGIN },
  { path: '.claude/scripts/', reason: FROM_PLUGIN },
  { path: '.claude/hooks/', reason: FROM_PLUGIN },
  { path: 'HOW_TO_USE.md', reason: FROM_PLUGIN },
  { path: 'docs/milestone-templates/', reason: FROM_PLUGIN },
  { path: 'docs/proposal-templates/', reason: 'i modelli commerciali stanno nel sistema, non nel repository' },
  { path: 'plopfile.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/gen/', reason: FROM_PACKAGE },
  { path: 'scripts/templates/', reason: FROM_PACKAGE },
  { path: 'scripts/check-comments.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/check-language.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/bundle-budget.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/smoke-production.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/lighthouse.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/verify-analytics-coverage.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/gen-icons.mjs', reason: FROM_PACKAGE },
  { path: 'scripts/gen-icons.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lhci-local.sh', reason: FROM_PACKAGE },
  { path: 'scripts/lib/bundle-budget.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/smoke-production.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/routes.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/check-comments.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/check-language.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/gtm-container.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/analytics-coverage.ts', reason: FROM_PACKAGE },
  { path: 'scripts/lib/icons.ts', reason: FROM_PACKAGE },
  { path: '.github/workflows/vercel-cli.yml', reason: "il pin di Vercel sta nell'action di deploy di officina" },
  { path: 'docs/PROJECT.md', reason: OUT_OF_REPOSITORY },
  { path: 'docs/DECISIONS.md', reason: OUT_OF_REPOSITORY },
  { path: 'docs/RISKS.md', reason: OUT_OF_REPOSITORY },
  { path: 'docs/INPUTS.md', reason: OUT_OF_REPOSITORY },
  { path: 'docs/TASK-CONTEXT.md', reason: OUT_OF_REPOSITORY },
  { path: 'docs/ESTIMATE.md', reason: OUT_OF_REPOSITORY },
]

const holds = (paths: readonly string[], target: string): boolean =>
  target.endsWith('/') ? paths.some((path) => path.startsWith(target)) : paths.includes(target)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// I file JSON si leggono come JSON: `"hooks"` dentro un valore qualunque non è un blocco `hooks`,
// e un file illeggibile non è un file che dichiara quello che si cerca.
function readJson({ read }: ProjectFiles, path: string): Record<string, unknown> | undefined {
  const source = read(path)
  if (source === undefined) return undefined
  try {
    const value: unknown = JSON.parse(source)
    return isRecord(value) ? value : undefined
  } catch {
    return undefined
  }
}

export function leftoverGaps(files: ProjectFiles): ContractGap[] {
  const gaps: ContractGap[] = LEFTOVERS.filter(({ path }) => holds(files.paths, path)).map(({ path, reason }) => ({
    path,
    message: `residuo: ${reason}`,
  }))
  if (readJson(files, '.claude/settings.json')?.hooks !== undefined) {
    gaps.push({ path: '.claude/settings.json', message: `blocco \`hooks\` residuo: il guard ${FROM_PLUGIN}` })
  }
  const servers = readJson(files, '.mcp.json')?.mcpServers
  if (isRecord(servers) && servers['astro-docs'] !== undefined) {
    gaps.push({ path: '.mcp.json', message: `server \`astro-docs\` residuo: ${FROM_PLUGIN}` })
  }
  return gaps
}

export const BIOME_PRESET = '@elia97/officina/biome'
export const LEFTHOOK_PRESET = 'node_modules/@elia97/officina/presets/lefthook.yml'

export function presetGaps(files: ProjectFiles): ContractGap[] {
  const gaps: ContractGap[] = []
  const extended = readJson(files, 'biome.json')?.extends
  if (!(Array.isArray(extended) && extended.includes(BIOME_PRESET))) {
    gaps.push({ path: 'biome.json', message: `non estende \`${BIOME_PRESET}\`` })
  }
  if (!mentions(files.read('lefthook.yml'), LEFTHOOK_PRESET)) {
    gaps.push({ path: 'lefthook.yml', message: `non estende \`${LEFTHOOK_PRESET}\`` })
  }
  return gaps
}
