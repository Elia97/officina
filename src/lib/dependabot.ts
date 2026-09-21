import { parse } from 'yaml'

import type { ProjectFiles } from './alignment.ts'
import type { ContractGap } from './contract.ts'

const DEPENDABOT = '.github/dependabot.yml'
const PACKAGE = '@elia97/officina'
const ACTIONS = 'Elia97/officina/*'

const GROUP_ONLY: readonly string[] = ['commit-message', 'open-pull-requests-limit']

interface Update {
  'package-ecosystem'?: string
  patterns?: readonly string[]
  'multi-ecosystem-group'?: string
  'commit-message'?: unknown
  'open-pull-requests-limit'?: unknown
}

interface Dependabot {
  'multi-ecosystem-groups'?: Record<string, unknown>
  updates?: readonly Update[]
}

const gap = (message: string): ContractGap => ({ path: DEPENDABOT, message })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function read(source: string): Dependabot | string {
  try {
    const document: unknown = parse(source)
    return isRecord(document) ? (document as Dependabot) : 'non è una mappa YAML'
  } catch (error) {
    return `non è YAML valido: ${String(error).replace(/\n[\s\S]*$/, '')}`
  }
}

const inGroup = (updates: readonly Update[]) => updates.filter((u) => u['multi-ecosystem-group'] !== undefined)

const covers = (update: Update, needle: string): boolean => (update.patterns ?? []).includes(needle)

function groupGaps(document: Dependabot, updates: readonly Update[]): ContractGap[] {
  const groups = document['multi-ecosystem-groups']
  if (!isRecord(groups) || Object.keys(groups).length === 0) {
    return [gap('non dichiara `multi-ecosystem-groups`: il pacchetto e le sue action si alzano separati')]
  }
  return inGroup(updates)
    .filter((update) => !((update['multi-ecosystem-group'] as string) in groups))
    .map((update) =>
      gap(
        `la voce \`${update['package-ecosystem']}\` cita il gruppo \`${update['multi-ecosystem-group']}\`, che non esiste`,
      ),
    )
}

const misplacedGaps = (updates: readonly Update[]): ContractGap[] =>
  inGroup(updates).flatMap((update) =>
    GROUP_ONLY.filter((key) => update[key as keyof Update] !== undefined).map((key) =>
      gap(
        `\`${key}\` sta sulla voce \`${update['package-ecosystem']}\` del gruppo: va sul gruppo, e Dependabot rifiuta il file`,
      ),
    ),
  )

const coverageGaps = (updates: readonly Update[]): ContractGap[] =>
  [
    { ecosystem: 'npm', needle: PACKAGE, reason: 'il gruppo deve prendere il pacchetto da npm' },
    { ecosystem: 'github-actions', needle: ACTIONS, reason: 'il gruppo deve prendere le action da github-actions' },
  ]
    .filter(
      ({ ecosystem, needle }) =>
        !inGroup(updates).some((u) => u['package-ecosystem'] === ecosystem && covers(u, needle)),
    )
    .map(({ needle, reason }) => gap(`nessuna voce del gruppo copre \`${needle}\`: ${reason}`))

// `patterns` restringe l'intera voce: il resto dell'ecosistema smette di aggiornarsi e nessun check diventa rosso.
function restGaps(updates: readonly Update[]): ContractGap[] {
  const restrained = inGroup(updates).filter((update) => (update.patterns ?? []).length > 0)
  return restrained.flatMap((update) => {
    const ecosystem = update['package-ecosystem']
    const rest = updates.find(
      (other) => other['package-ecosystem'] === ecosystem && other['multi-ecosystem-group'] === undefined,
    )
    if (rest === undefined) {
      return [gap(`\`${ecosystem}\` sta solo nella voce del gruppo, con \`patterns\`: il resto non si aggiorna più`)]
    }
    return rest['commit-message'] === undefined
      ? [gap(`la voce \`${ecosystem}\` fuori dal gruppo non ha \`commit-message\`: le sue PR non passano il titolo`)]
      : []
  })
}

export function dependabotGaps({ read: readFile }: ProjectFiles): ContractGap[] {
  const source = readFile(DEPENDABOT)
  if (source === undefined) {
    return [gap('manca: senza, il pacchetto e le sue action si alzano separati')]
  }

  const document = read(source)
  if (typeof document === 'string') return [gap(document)]

  const updates = document.updates ?? []
  return [...groupGaps(document, updates), ...misplacedGaps(updates), ...coverageGaps(updates), ...restGaps(updates)]
}
