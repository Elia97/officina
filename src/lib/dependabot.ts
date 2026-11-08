import { parse } from 'yaml'

import type { ProjectFiles } from './alignment.ts'
import type { ContractGap } from './contract.ts'
import {
  ACTIONS,
  BIOME,
  covers,
  DEPENDABOT,
  gap,
  groupFollowGaps,
  inGroup,
  isRecord,
  PACKAGE,
  type Update,
} from './dependabot-group.ts'

const PATH_FILTER = `${ACTIONS}/*`

const GROUP_ONLY: readonly string[] = ['commit-message', 'open-pull-requests-limit']

interface Dependabot {
  'multi-ecosystem-groups'?: Record<string, unknown>
  updates?: readonly Update[]
}

function read(source: string): Dependabot | string {
  try {
    const document: unknown = parse(source)
    return isRecord(document) ? (document as Dependabot) : 'non è una mappa YAML'
  } catch (error) {
    return `non è YAML valido: ${String(error).replace(/\n[\s\S]*$/, '')}`
  }
}

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

const COVERED: readonly { ecosystem: string; needle: string; reason: string; severity?: 'warning' }[] = [
  { ecosystem: 'npm', needle: PACKAGE, reason: 'il gruppo deve prendere il pacchetto da npm' },
  {
    ecosystem: 'npm',
    needle: BIOME,
    reason:
      'il preset di officina nomina regole che una minor di Biome può rinominare, e i due aggiornamenti vanno in una PR sola',
    severity: 'warning',
  },
  { ecosystem: 'github-actions', needle: ACTIONS, reason: 'il gruppo deve prendere le action da github-actions' },
]

const coverageGaps = (updates: readonly Update[]): ContractGap[] =>
  COVERED.filter(
    ({ ecosystem, needle }) => !inGroup(updates).some((u) => u['package-ecosystem'] === ecosystem && covers(u, needle)),
  ).map(({ needle, reason, severity }) => ({
    ...gap(`nessuna voce del gruppo copre \`${needle}\`: ${reason}`),
    ...(severity === undefined ? {} : { severity }),
  }))

const strings = (value: unknown): string[] => {
  if (typeof value === 'string') return [value]
  return typeof value === 'object' && value !== null ? Object.values(value).flatMap(strings) : []
}

const pathFilterGaps = (document: Dependabot): ContractGap[] =>
  strings(document).includes(PATH_FILTER)
    ? [
        gap(
          `\`${PATH_FILTER}\` non corrisponde a nessuna dipendenza: Dependabot chiama le action \`${ACTIONS}\`, senza la sottocartella, e il filtro va corretto ovunque compaia`,
        ),
      ]
    : []

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
  return [
    ...groupGaps(document, updates),
    ...misplacedGaps(updates),
    ...coverageGaps(updates),
    ...pathFilterGaps(document),
    ...restGaps(updates),
    ...groupFollowGaps(updates),
  ]
}
