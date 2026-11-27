import { existsSync, readFileSync } from 'node:fs'

import { commitOf, treeOf } from './git.ts'
import { ghApi } from './github.ts'

export const GATE_CONTEXT = 'gate'

export const VERIFIED_TREE = 'node_modules/.cache/officina/gate-tree'

export type Tree = { tree: string } | { error: string }

export type SignoffSources = {
  verified: () => string | undefined
  commit: (ref: string) => string
  tree: (sha: string) => string
  publish: (sha: string, tree: string) => void
}

export type Outcome = { ok: boolean; message: string }

export const short = (sha: string): string => sha.slice(0, 7)

const message = (error: unknown): string => (error as Error).message

export function annotation(before: Tree, after: Tree): { tree?: string; line: string } {
  if ('error' in before) return { line: `  Tree non annotato: ${before.error}` }
  if ('error' in after) return { line: `  Tree non annotato: ${after.error}` }
  if (before.tree !== after.tree) return { line: "  Tree non annotato: l'albero di lavoro è cambiato durante il gate" }
  return {
    tree: before.tree,
    line: `  Tree ${short(before.tree)} annotato: officina signoff pubblica lo stato gate sul commit che lo porta.`,
  }
}

const fail = (text: string): Outcome => ({ ok: false, message: `✗ signoff — ${text}.` })

export function signoff(ref: string, sources: SignoffSources): Outcome {
  const verified = sources.verified()
  if (verified === undefined) return fail('nessun gate verde annotato in questo checkout: lancia `officina gate`')
  let sha: string
  let tree: string
  try {
    sha = sources.commit(ref)
    tree = sources.tree(sha)
  } catch (error) {
    return fail(`${ref} non è un commit: ${message(error)}`)
  }
  if (tree !== verified)
    return fail(
      `il tree di ${short(sha)} è ${short(tree)}, il gate verde ha verificato ${short(verified)}: un commit fatto a mano, un rebase o una modifica dopo il gate cambiano il tree, e il gate va rilanciato`,
    )
  try {
    sources.publish(sha, tree)
  } catch (error) {
    return fail(`GitHub non ha accettato lo stato su ${short(sha)}, che va pubblicato dopo il push: ${message(error)}`)
  }
  return { ok: true, message: `✓ signoff — stato gate verde su ${short(sha)}, tree ${short(tree)}.` }
}

function readVerified(): string | undefined {
  if (!existsSync(VERIFIED_TREE)) return undefined
  return readFileSync(VERIFIED_TREE, 'utf8').trim() || undefined
}

export const signoffSources = (): SignoffSources => ({
  verified: readVerified,
  commit: commitOf,
  tree: treeOf,
  publish: (sha, tree) =>
    void ghApi([
      '--method',
      'POST',
      `repos/{owner}/{repo}/statuses/${sha}`,
      '-f',
      'state=success',
      '-f',
      `context=${GATE_CONTEXT}`,
      '-f',
      `description=officina gate verde in locale sul tree ${short(tree)}`,
    ]),
})
