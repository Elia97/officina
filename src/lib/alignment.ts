import type { OfficinaConfig } from './config.ts'
import type { ContractGap } from './contract.ts'

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

export function leftoverGaps({ paths, read }: ProjectFiles): ContractGap[] {
  const gaps: ContractGap[] = LEFTOVERS.filter(({ path }) => holds(paths, path)).map(({ path, reason }) => ({
    path,
    message: `residuo: ${reason}`,
  }))
  if (read('.claude/settings.json')?.includes('"hooks"')) {
    gaps.push({ path: '.claude/settings.json', message: `blocco \`hooks\` residuo: il guard ${FROM_PLUGIN}` })
  }
  if (read('.mcp.json')?.includes('astro-docs')) {
    gaps.push({ path: '.mcp.json', message: `server \`astro-docs\` residuo: ${FROM_PLUGIN}` })
  }
  return gaps
}

export const BIOME_PRESET = '@elia97/officina/biome'
export const LEFTHOOK_PRESET = 'node_modules/@elia97/officina/presets/lefthook.yml'

export function presetGaps({ read }: ProjectFiles): ContractGap[] {
  const gaps: ContractGap[] = []
  if (!read('biome.json')?.includes(BIOME_PRESET)) {
    gaps.push({ path: 'biome.json', message: `non estende \`${BIOME_PRESET}\`` })
  }
  if (!read('lefthook.yml')?.includes(LEFTHOOK_PRESET)) {
    gaps.push({ path: 'lefthook.yml', message: `non estende \`${LEFTHOOK_PRESET}\`` })
  }
  return gaps
}

const ACTIONS: readonly { workflow: string; action: string }[] = [
  { workflow: '.github/workflows/ci.yml', action: 'ci' },
  { workflow: '.github/workflows/ci.yml', action: 'review' },
  { workflow: '.github/workflows/deploy.yml', action: 'deploy' },
  { workflow: '.github/workflows/lighthouse.yml', action: 'lighthouse' },
]

// Un tag di versione o uno SHA intero: `@main` farebbe girare in produzione passi mai collaudati.
const PINNED_REF = /^(v\d+\.\d+\.\d+|[0-9a-f]{40})$/

function actionGap(source: string | undefined, action: string): string | undefined {
  const name = `Elia97/officina/actions/${action}`
  if (source === undefined) return `manca: i suoi passi arrivano da \`${name}\``
  const ref = new RegExp(`${name}@(\\S+)`).exec(source)?.[1]
  if (ref === undefined) return `non usa \`${name}\``
  return PINNED_REF.test(ref)
    ? undefined
    : `\`${name}@${ref}\`: il riferimento va fissato a un tag di versione o a uno SHA`
}

export function workflowGaps({ read }: ProjectFiles): ContractGap[] {
  return ACTIONS.flatMap(({ workflow, action }) => {
    const message = actionGap(read(workflow), action)
    return message === undefined ? [] : [{ path: workflow, message }]
  })
}

const CONFIG = 'officina.config.ts'

function siteUrlGap(siteUrl: string | undefined): string | undefined {
  if (siteUrl === undefined) return '`siteUrl` assente: `check smoke` non ha un host canonico'
  if (!URL.canParse(siteUrl)) return `\`siteUrl\` non è un URL: \`${siteUrl}\``
  return siteUrl.endsWith('/') ? `\`siteUrl\` finisce con una barra: \`${siteUrl}\`` : undefined
}

/** `loaded` è la configurazione letta, l'errore che il suo caricamento ha sollevato, o `undefined` se il file non c'è. */
export function configGaps(loaded: OfficinaConfig | Error | undefined): ContractGap[] {
  if (loaded === undefined) return [{ path: CONFIG, message: 'manca: i valori del progetto per officina stanno qui' }]
  if (loaded instanceof Error) return [{ path: CONFIG, message: `non si carica: ${loaded.message}` }]
  const messages = [
    siteUrlGap(loaded.siteUrl),
    loaded.icons === undefined ? '`icons.background` assente: `gen icons` non ha un colore di fondo' : undefined,
  ]
  return messages.filter((message) => message !== undefined).map((message) => ({ path: CONFIG, message }))
}
