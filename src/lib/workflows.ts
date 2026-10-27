import { parse } from 'yaml'

import type { ProjectFiles } from './alignment.ts'
import type { ContractGap } from './contract.ts'
import { isRecord } from './validate.ts'

export const isLive = (line: string): boolean => !line.trimStart().startsWith('#')

const liveLines = (source: string): string[] => source.split(/\r?\n/).filter(isLive)

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

const actionName = (action: string): string => `Elia97/officina/actions/${action}`

function actionGap(source: string | undefined, action: string, version: string): string | undefined {
  const name = actionName(action)
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

export interface ActionInputs {
  workflow: string
  action: string
  inputs: readonly { name: string; reason: string; notFrom?: readonly { secret: string; reason: string }[] }[]
}

function parsed(source: string): { workflow: unknown } | { error: string } {
  try {
    return { workflow: parse(source) }
  } catch (error) {
    return { error: `non è YAML valido: ${String(error).replace(/\n[\s\S]*$/, '')}` }
  }
}

function jobsOf(source: string): [string, Record<string, unknown>][] | string {
  const result = parsed(source)
  if ('error' in result) return result.error
  const { workflow } = result
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) return []
  return Object.entries(workflow.jobs).filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
}

const stepsOf = (job: Record<string, unknown>): unknown[] => (Array.isArray(job.steps) ? job.steps : [])

const usesAction = (step: unknown, action: string): step is Record<string, unknown> =>
  isRecord(step) && String(step.uses).startsWith(`${actionName(action)}@`)

function stepsUsing(source: string, action: string): Record<string, unknown>[] | string {
  const jobs = jobsOf(source)
  if (typeof jobs === 'string') return jobs
  return jobs.flatMap(([, job]) => stepsOf(job)).filter((step) => usesAction(step, action))
}

const CI_WORKFLOW = '.github/workflows/ci.yml'

const hasTimeout = (job: Record<string, unknown>): boolean =>
  job['timeout-minutes'] !== undefined && job['timeout-minutes'] !== null

/** Il passo di una composite action non accetta `timeout-minutes`: il tetto sta sul job che la chiama. */
export function ciTimeoutGaps({ read }: ProjectFiles): ContractGap[] {
  const source = read(CI_WORKFLOW)
  const jobs = source === undefined ? [] : jobsOf(source)
  if (typeof jobs === 'string') return []
  return jobs
    .filter(([, job]) => stepsOf(job).some((step) => usesAction(step, 'ci')) && !hasTimeout(job))
    .map(
      ([name]): ContractGap => ({
        path: CI_WORKFLOW,
        severity: 'warning',
        message: `il job \`${name}\` usa \`${actionName('ci')}\` senza \`timeout-minutes\`: con un mirror di apt fermo la corsa resta aperta fino al tetto di GitHub, 6 ore`,
      }),
    )
}

const inputValue = (step: Record<string, unknown>, input: string): unknown =>
  isRecord(step.with) ? step.with[input] : undefined

const receives = (step: Record<string, unknown>, input: string): boolean => {
  const value = inputValue(step, input)
  return value !== undefined && value !== null && value !== ''
}

const receivesFrom = (step: Record<string, unknown>, input: string, secret: string): boolean =>
  String(inputValue(step, input)).split(/\W/).includes(secret)

/** Un workflow che non usa l'action lo segnala già `workflowGaps`. */
export function actionInputGaps({ read }: ProjectFiles, { workflow, action, inputs }: ActionInputs): ContractGap[] {
  const source = read(workflow)
  if (source === undefined) return []
  const steps = stepsUsing(source, action)
  if (typeof steps === 'string') return [{ path: workflow, message: steps }]
  const gap = (message: string): ContractGap[] => [{ path: workflow, message: `\`${actionName(action)}\` ${message}` }]
  return inputs.flatMap(({ name, reason, notFrom = [] }) => {
    if (steps.some((step) => !receives(step, name))) return gap(`non riceve \`${name}\`: ${reason}`)
    const wrong = notFrom.find(({ secret }) => steps.some((step) => receivesFrom(step, name, secret)))
    return wrong === undefined ? [] : gap(`riceve \`${name}\` da \`${wrong.secret}\`: ${wrong.reason}`)
  })
}
