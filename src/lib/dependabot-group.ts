import type { ContractGap } from './contract.ts'

export const DEPENDABOT = '.github/dependabot.yml'
export const PACKAGE = '@elia97/officina'
export const ACTIONS = 'Elia97/officina'
export const BIOME = '@biomejs/biome'

const MAJOR = 'version-update:semver-major'
// `DEFAULT_COOLDOWN_DAYS` di dependabot-core: vale senza la chiave `cooldown` e senza `default-days`.
const DEFAULT_COOLDOWN_DAYS = 3

interface Ignore {
  'dependency-name'?: unknown
  'update-types'?: unknown
}

interface Cooldown {
  'default-days'?: unknown
  'semver-minor-days'?: unknown
  'semver-patch-days'?: unknown
  include?: unknown
  exclude?: unknown
}

export interface Update {
  'package-ecosystem'?: string
  patterns?: readonly string[]
  'multi-ecosystem-group'?: string
  'commit-message'?: unknown
  'open-pull-requests-limit'?: unknown
  ignore?: unknown
  cooldown?: unknown
}

export const gap = (message: string): ContractGap => ({ path: DEPENDABOT, message })

const warning = (message: string): ContractGap => ({ ...gap(message), severity: 'warning' })

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export const inGroup = (updates: readonly Update[]) => updates.filter((u) => u['multi-ecosystem-group'] !== undefined)

export const covers = (update: Update, needle: string): boolean => (update.patterns ?? []).includes(needle)

// Dependabot confronta nomi e filtri con `File.fnmatch?`: qui serve solo l'asterisco.
const matches = (pattern: unknown, name: string): boolean =>
  typeof pattern === 'string' &&
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`).test(name)

const ignores = (update: Update): Ignore[] => list(update.ignore).filter(isRecord)

const ignoresEntirely = (update: Update, name: string): boolean =>
  ignores(update).some((entry) => matches(entry['dependency-name'], name) && entry['update-types'] === undefined)

const ignoresMajor = (update: Update, name: string): boolean =>
  ignores(update).some(
    (entry) => matches(entry['dependency-name'], name) && list(entry['update-types']).includes(MAJOR),
  )

const FOLLOWED: readonly { ecosystem: string; needle: string }[] = [
  { ecosystem: 'npm', needle: PACKAGE },
  { ecosystem: 'npm', needle: BIOME },
  { ecosystem: 'github-actions', needle: ACTIONS },
]

/** Senza un `ignore` intero nella voce del resto, la stessa dipendenza la alzano due voci, in due PR. */
const restIgnoreGaps = (updates: readonly Update[]): ContractGap[] =>
  FOLLOWED.filter(({ ecosystem, needle }) =>
    inGroup(updates).some((u) => u['package-ecosystem'] === ecosystem && covers(u, needle)),
  ).flatMap(({ ecosystem, needle }) =>
    updates
      .filter((u) => u['package-ecosystem'] === ecosystem && u['multi-ecosystem-group'] === undefined)
      .filter((rest) => !ignoresEntirely(rest, needle))
      .map(() =>
        warning(
          `la voce \`${ecosystem}\` fuori dal gruppo non ignora \`${needle}\`, che il gruppo copre: serve un \`ignore\` con il solo \`dependency-name\`, altrimenti la stessa dipendenza la alzano due voci, in due PR`,
        ),
      ),
  )

const biomeMajorGaps = (updates: readonly Update[]): ContractGap[] =>
  inGroup(updates)
    .filter((u) => u['package-ecosystem'] === 'npm' && covers(u, BIOME) && !ignoresMajor(u, BIOME))
    .map(() =>
      warning(
        `la voce \`npm\` del gruppo non ignora le major di \`${BIOME}\`: il preset di officina regge Biome fino alla 3 esclusa`,
      ),
    )

interface Days {
  minor: number
  patch: number
}

const positive = (value: unknown): number | undefined => (typeof value === 'number' && value > 0 ? value : undefined)

/** Come `ReleaseCooldownOptions` di dependabot-core, per i salti di minor e di patch. */
function cooldownDays(update: Update, name: string): Days {
  const cooldown: Cooldown = isRecord(update.cooldown) ? update.cooldown : {}
  const include = list(cooldown.include)
  const excluded = list(cooldown.exclude).some((pattern) => matches(pattern, name))
  if (excluded || (include.length > 0 && !include.some((pattern) => matches(pattern, name)))) {
    return { minor: 0, patch: 0 }
  }
  const base = typeof cooldown['default-days'] === 'number' ? cooldown['default-days'] : DEFAULT_COOLDOWN_DAYS
  return {
    minor: positive(cooldown['semver-minor-days']) ?? base,
    patch: positive(cooldown['semver-patch-days']) ?? base,
  }
}

const daysText = (count: number): string => `${count} ${count === 1 ? 'giorno' : 'giorni'}`

const describe = ({ minor, patch }: Days): string =>
  minor === patch ? daysText(minor) : `${daysText(minor)} sulle minor e ${daysText(patch)} sulle patch`

function cooldownGaps(updates: readonly Update[]): ContractGap[] {
  const grouped = inGroup(updates)
  const npm = grouped.find((u) => u['package-ecosystem'] === 'npm' && covers(u, PACKAGE))
  const actions = grouped.find((u) => u['package-ecosystem'] === 'github-actions' && covers(u, ACTIONS))
  if (npm === undefined || actions === undefined) return []
  const pkg = cooldownDays(npm, PACKAGE)
  const action = cooldownDays(actions, ACTIONS)
  if (pkg.minor === action.minor && pkg.patch === action.patch) return []
  return [
    warning(
      `il cooldown di \`${PACKAGE}\` nella voce \`npm\` del gruppo è di ${describe(pkg)}, quello di \`${ACTIONS}\` nella voce \`github-actions\` di ${describe(action)}: finché non coincidono la PR del gruppo porta il pacchetto e le action a versioni diverse, e il controllo sulla stessa versione la boccia`,
    ),
  ]
}

export const groupFollowGaps = (updates: readonly Update[]): ContractGap[] => [
  ...restIgnoreGaps(updates),
  ...biomeMajorGaps(updates),
  ...cooldownGaps(updates),
]
