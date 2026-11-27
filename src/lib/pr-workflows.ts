import { parse } from 'yaml'

import type { ProjectFiles } from './alignment.ts'
import type { ContractGap } from './contract.ts'
import { isRecord } from './validate.ts'
import { stepsOf, usesAction } from './workflows.ts'

const CI_WORKFLOW = '.github/workflows/ci.yml'
const PR_TITLE_WORKFLOW = '.github/workflows/pr-title.yml'
const RELEASE_BRANCH = 'release-please--'

// GitHub: i `permissions` di un job sostituiscono per intero quelli del workflow, non si sommano.
function grants(permissions: unknown, scope: string): boolean {
  if (permissions === 'read-all' || permissions === 'write-all') return true
  return isRecord(permissions) && ['read', 'write'].includes(String(permissions[scope]))
}

function ciJobs(source: string): { workflow: Record<string, unknown>; jobs: [string, Record<string, unknown>][] } {
  let workflow: unknown
  try {
    workflow = parse(source)
  } catch {
    return { workflow: {}, jobs: [] }
  }
  if (!isRecord(workflow) || !isRecord(workflow.jobs)) return { workflow: {}, jobs: [] }
  const jobs = Object.entries(workflow.jobs).filter((entry): entry is [string, Record<string, unknown>] =>
    isRecord(entry[1]),
  )
  return { workflow, jobs }
}

const using = (jobs: [string, Record<string, unknown>][], action: string) =>
  jobs.filter(([, job]) => stepsOf(job).some((step) => usesAction(step, action)))

function permissionGaps(workflow: Record<string, unknown>, jobs: [string, Record<string, unknown>][]): ContractGap[] {
  return using(jobs, 'ci').flatMap(([name, job]): ContractGap[] => {
    const permissions = 'permissions' in job ? job.permissions : workflow.permissions
    return [
      ...(grants(permissions, 'pull-requests')
        ? []
        : [
            {
              path: CI_WORKFLOW,
              message: `il job \`${name}\` usa \`Elia97/officina/actions/ci\` senza \`pull-requests: read\`: il passo del titolo legge la PR dall'API, e su un repository privato fallisce`,
            },
          ]),
      ...(grants(permissions, 'statuses')
        ? []
        : [
            {
              path: CI_WORKFLOW,
              severity: 'warning' as const,
              message: `il job \`${name}\` usa \`Elia97/officina/actions/ci\` senza \`statuses: read\`: \`officina scope\` non legge lo stato gate del commit, e la CI fa sempre il percorso completo`,
            },
          ]),
    ]
  })
}

const reviewGaps = (jobs: [string, Record<string, unknown>][]): ContractGap[] =>
  using(jobs, 'review')
    .filter(([, job]) => !String(job.if ?? '').includes(RELEASE_BRANCH))
    .map(([name]) => ({
      path: CI_WORKFLOW,
      severity: 'warning',
      message: `il job \`${name}\` usa \`Elia97/officina/actions/review\` anche sulla PR di release: un \`if:\` che escluda \`github.head_ref\` che comincia con \`${RELEASE_BRANCH}\` risparmia un install e una review su versione e changelog`,
    }))

export function pullRequestGaps({ read }: ProjectFiles): ContractGap[] {
  const leftover: ContractGap[] =
    read(PR_TITLE_WORKFLOW) === undefined
      ? []
      : [
          {
            path: PR_TITLE_WORKFLOW,
            severity: 'warning',
            message: 'il titolo della PR lo controlla `actions/ci`: questo workflow gira a ogni push e va tolto',
          },
        ]
  const source = read(CI_WORKFLOW)
  if (source === undefined) return leftover
  const { workflow, jobs } = ciJobs(source)
  return [...leftover, ...permissionGaps(workflow, jobs), ...reviewGaps(jobs)]
}
