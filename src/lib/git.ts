import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import process from 'node:process'

type GitOptions = { allowFailure?: boolean }

function git(args: string[], { allowFailure = false }: GitOptions = {}): string {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    if (allowFailure) return ''
    throw new Error(result.stderr.trim() || `git ${args.join(' ')} fallito`)
  }
  return result.stdout
}

// Senza -z git cita ed escapa i path non ASCII ("docs/\303\250.md"): existsSync non li trova
// e il file sparisce dalla passata senza errori.
const gitPaths = (subcommand: string, args: string[]) =>
  git([subcommand, '-z', ...args])
    .split('\0')
    .filter(Boolean)

export const trackedAndUntracked = (): string[] => [
  ...gitPaths('ls-files', []),
  ...gitPaths('ls-files', ['--others', '--exclude-standard']),
]

function ensureCommit(ref: string): void {
  const exists = spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
    stdio: 'ignore',
  })
  if (exists.status === 0) return
  // Checkout shallow in CI: la base della PR spesso non c'è in locale.
  git(['fetch', '--no-tags', 'origin', ref])
}

function defaultBase(): string {
  const originHead = git(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
    allowFailure: true,
  }).trim()
  if (originHead) return originHead
  for (const candidate of ['origin/main', 'main', 'origin/master', 'master']) {
    if (
      git(['rev-parse', '--verify', '--quiet', candidate], {
        allowFailure: true,
      }).trim()
    )
      return candidate
  }
  throw new Error('nessuna base trovata: passa --base <ref>')
}

// Sulle PR GitHub il diff va fatto tra gli SHA dell'evento, non tra branch locali.
function pullRequestShas(): { base: string; head: string } | undefined {
  const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH } = process.env
  if (GITHUB_EVENT_NAME !== 'pull_request' || !GITHUB_EVENT_PATH || !existsSync(GITHUB_EVENT_PATH)) return undefined
  const { pull_request: pr } = JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'))
  return pr?.base?.sha && pr?.head?.sha ? { base: pr.base.sha, head: pr.head.sha } : undefined
}

export type DiffScope = { base?: string | undefined; head?: string | undefined }

export function changedFiles({ base, head }: DiffScope): string[] {
  const pr = base ? undefined : pullRequestShas()
  const from = base ?? pr?.base ?? defaultBase()
  const to = head ?? pr?.head ?? 'HEAD'
  ensureCommit(from)
  ensureCommit(to)

  let committed: string[]
  try {
    committed = gitPaths('diff', ['--name-only', '--diff-filter=ACMR', `${from}...${to}`])
  } catch (error) {
    throw new Error(
      `diff ${from}...${to} fallito (clone shallow? prova "git fetch --unshallow"): ${(error as Error).message}`,
    )
  }

  // In locale contano anche le modifiche non ancora committate; con un head esplicito o in PR no.
  const includeWorkingTree = !pr && !head
  const workingTree = includeWorkingTree
    ? [
        ...gitPaths('diff', ['--name-only', '--diff-filter=ACMR']),
        ...gitPaths('diff', ['--cached', '--name-only', '--diff-filter=ACMR']),
        ...gitPaths('ls-files', ['--others', '--exclude-standard']),
      ]
    : []

  return [...new Set([...committed, ...workingTree])]
}
