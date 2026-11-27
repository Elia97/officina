import { readFileSync } from 'node:fs'
import process from 'node:process'

import type { CiScope } from './ci-scope.ts'
import { eventHead, treeOf } from './git.ts'
import { ghApi } from './github.ts'
import { GATE_CONTEXT, short } from './signoff.ts'
import { isRecord } from './validate.ts'

export type GateSources = {
  migrate: string
  scripts: () => Record<string, unknown>
  head: string | undefined
  statuses: (sha: string) => unknown
  commitTree: (sha: string) => string
  checkoutTree: () => string
}

const INTEGRATION = 'test:integration'

export function gatePassed(combined: unknown): boolean {
  if (!isRecord(combined) || !Array.isArray(combined.statuses)) return false
  return combined.statuses.some(
    (status) => isRecord(status) && status.context === GATE_CONTEXT && status.state === 'success',
  )
}

function gateProblem(sources: GateSources): string | undefined {
  const { head } = sources
  if (sources.migrate !== '' && sources.scripts()[INTEGRATION] === undefined)
    return `con migrate il percorso del gate vuole lo script ${INTEGRATION}`
  if (head === undefined) return "l'evento non ha un commit di cui leggere lo stato gate"
  if (!gatePassed(sources.statuses(head))) return `nessuno stato gate verde su ${short(head)}`
  if (sources.commitTree(head) !== sources.checkoutTree())
    return `il checkout non ha il tree di ${short(head)}: la base è andata avanti dopo il gate`
  return undefined
}

export function gateScope(full: CiScope, sources: GateSources): CiScope {
  let problem: string | undefined
  try {
    problem = gateProblem(sources)
  } catch (error) {
    const { message } = error as Error
    problem = `lo stato gate non si verifica${/\b403\b/.test(message) ? ', e il job vuole statuses: read' : ''}: ${message}`
  }
  if (problem !== undefined) return { path: 'full', reason: `${full.reason}; ${problem}` }
  return {
    path: 'gate',
    reason: `percorso del gate: stato gate verde su ${short(sources.head as string)}, con il tree del checkout`,
  }
}

function readScripts(): Record<string, unknown> {
  try {
    const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts
    return isRecord(scripts) ? scripts : {}
  } catch {
    return {}
  }
}

export const gateSources = (): GateSources => ({
  migrate: process.env.OFFICINA_MIGRATE ?? '',
  scripts: readScripts,
  head: eventHead(),
  statuses: (sha) => JSON.parse(ghApi([`repos/{owner}/{repo}/commits/${sha}/status`])),
  commitTree: (sha) => ghApi([`repos/{owner}/{repo}/git/commits/${sha}`, '--jq', '.tree.sha']).trim(),
  checkoutTree: () => treeOf('HEAD'),
})
