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

function ensureCommit(ref: string, { shallow = false } = {}): void {
  const exists = spawnSync('git', ['cat-file', '-e', `${ref}^{commit}`], {
    stdio: 'ignore',
  })
  if (exists.status === 0) return
  // Checkout shallow in CI: la base della PR spesso non c'è in locale.
  git(['fetch', '--no-tags', ...(shallow ? ['--depth=1'] : []), 'origin', ref])
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

const eventPayload = (name: string) => {
  const { GITHUB_EVENT_NAME, GITHUB_EVENT_PATH } = process.env
  if (GITHUB_EVENT_NAME !== name || !GITHUB_EVENT_PATH || !existsSync(GITHUB_EVENT_PATH)) return undefined
  return JSON.parse(readFileSync(GITHUB_EVENT_PATH, 'utf8'))
}

// Sulle PR GitHub il diff va fatto tra gli SHA dell'evento, non tra branch locali.
function pullRequestShas(): { base: string; head: string } | undefined {
  const pr = eventPayload('pull_request')?.pull_request
  return pr?.base?.sha && pr?.head?.sha ? { base: pr.base.sha, head: pr.head.sha } : undefined
}

// Il primo push di un branch porta come `before` uno SHA tutto zeri, che non è un commit.
function pushBefore(): string | undefined {
  const before = eventPayload('push')?.before
  return typeof before === 'string' && !/^0+$/.test(before) ? before : undefined
}

export const eventBase = (): string | undefined => pullRequestShas()?.base ?? pushBefore()

export function changedSince(base: string): string[] {
  ensureCommit(base, { shallow: true })
  // Con il rilevamento delle rinomine, attivo di default, `--name-only` elenca solo il percorso nuovo;
  // `submodule.<nome>.ignore = all` in .gitmodules toglie dal diff anche un sottomodulo aggiornato.
  return gitPaths('diff', ['--name-only', '--no-renames', '--ignore-submodules=none', base, 'HEAD'])
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
