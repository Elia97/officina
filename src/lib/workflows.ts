import type { ProjectFiles } from './alignment.ts'
import type { ContractGap } from './contract.ts'

// I workflow restano una ricerca testuale — non c'è un parser YAML nel pacchetto — ma una riga
// commentata non deve soddisfare niente: è il modo più facile per avere un progetto «a posto»
// che in CI non lancia nessuno di questi passi.
const liveLines = (source: string): string[] =>
  source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('#'))

export const mentions = (source: string | undefined, needle: string): boolean =>
  source !== undefined && liveLines(source).some((line) => line.includes(needle))

const ACTIONS: readonly { workflow: string; action: string }[] = [
  { workflow: '.github/workflows/ci.yml', action: 'ci' },
  { workflow: '.github/workflows/ci.yml', action: 'review' },
  { workflow: '.github/workflows/deploy.yml', action: 'deploy' },
  { workflow: '.github/workflows/lighthouse.yml', action: 'lighthouse' },
]

// Un tag di versione o uno SHA intero: `@main` farebbe girare in produzione passi mai collaudati.
const TAG = /^v\d+\.\d+\.\d+$/
const SHA = /^[0-9a-f]{40}$/
const COMMENTED_VERSION = /#\s*(v\d+\.\d+\.\d+)/

function refOf(source: string, name: string): { line: string; ref: string } | undefined {
  const pattern = new RegExp(`${name}@(\\S+)`)
  for (const line of liveLines(source)) {
    const ref = pattern.exec(line)?.[1]
    if (ref !== undefined) return { line, ref }
  }
  return undefined
}

function refGap(line: string, ref: string, name: string, expected: string): string | undefined {
  if (TAG.test(ref)) {
    return ref === expected ? undefined : `\`${name}@${ref}\`: il pacchetto installato è la ${expected.slice(1)}`
  }
  if (!SHA.test(ref)) return `\`${name}@${ref}\`: il riferimento va fissato a un tag di versione o a uno SHA`
  const declared = COMMENTED_VERSION.exec(line)?.[1]
  if (declared === undefined) {
    return `\`${name}@${ref.slice(0, 7)}…\`: uno SHA non dice che versione è — scrivila nel commento (\`# ${expected}\`)`
  }
  return declared === expected
    ? undefined
    : `\`${name}@${ref.slice(0, 7)}… ${declared}\`: il pacchetto installato è la ${expected.slice(1)}`
}

function actionGap(source: string | undefined, action: string, version: string): string | undefined {
  const name = `Elia97/officina/actions/${action}`
  if (source === undefined) return `manca: i suoi passi arrivano da \`${name}\``
  const found = refOf(source, name)
  return found === undefined ? `non usa \`${name}\`` : refGap(found.line, found.ref, name, `v${version}`)
}

/** Le action del progetto devono stare alla stessa versione del pacchetto installato. */
export function workflowGaps({ read }: ProjectFiles, version: string): ContractGap[] {
  return ACTIONS.flatMap(({ workflow, action }) => {
    const message = actionGap(read(workflow), action, version)
    return message === undefined ? [] : [{ path: workflow, message }]
  })
}

const DEPENDABOT = '.github/dependabot.yml'

// Senza il gruppo, Dependabot apre due PR — una per il pacchetto npm, una per le action — e il
// controllo di coerenza qui sopra le boccia entrambe, perché nessuna delle due allinea l'altra.
const GROUPED: readonly { needle: string; reason: string }[] = [
  { needle: 'multi-ecosystem-groups', reason: 'il pacchetto e le sue action si alzano in una PR sola' },
  { needle: '@elia97/officina', reason: 'il gruppo deve prendere il pacchetto da npm' },
  { needle: 'Elia97/officina/*', reason: 'il gruppo deve prendere le action da github-actions' },
]

export function dependabotGaps({ read }: ProjectFiles): ContractGap[] {
  const source = read(DEPENDABOT)
  if (source === undefined) {
    return [{ path: DEPENDABOT, message: 'manca: senza, il pacchetto e le sue action si alzano separati' }]
  }
  return GROUPED.filter(({ needle }) => !mentions(source, needle)).map(({ needle, reason }) => ({
    path: DEPENDABOT,
    message: `non nomina \`${needle}\`: ${reason}`,
  }))
}
