import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { vi } from 'vitest'

type Git = (...args: string[]) => string
type Write = (path: string, text: string) => void
type Repository = { dir: string; git: Git; write: Write }

const created: string[] = []
const startDir = process.cwd()

export function cleanScopeRepos(): void {
  process.chdir(startDir)
  vi.unstubAllEnvs()
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
}

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  created.push(dir)
  return dir
}

function repository(prefix: string, ...init: string[]): Repository {
  const dir = tempDir(prefix)
  const git: Git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  const write: Write = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
  git('init', '--quiet', '--initial-branch=main', ...init)
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  return { dir, git, write }
}

function commitAll(git: Git, message: string): string {
  git('add', '-A')
  git('commit', '--quiet', '-m', message)
  return git('rev-parse', 'HEAD').trim()
}

function commitBase({ git, write }: Repository): string {
  write('src/lib/site.ts', 'export const SITE = {}\n')
  write('docs/ROADMAP.md', '# Roadmap\n')
  return commitAll(git, 'chore: base')
}

export function repoWithChange(change: (write: Write, git: Git) => void): string {
  const repo = repository('officina-scope-')
  const base = commitBase(repo)
  change(repo.write, repo.git)
  commitAll(repo.git, 'chore: modifica')
  process.chdir(repo.dir)
  return base
}

export function shallowPullRequest({ baseMoves = false } = {}): string {
  const remote = repository('officina-remote-', '--bare')
  const work = repository('officina-work-')
  const base = commitBase(work)
  work.git('checkout', '--quiet', '-b', 'pr')
  work.write('docs/ROADMAP.md', '# Roadmap\n\nMilestone 1\n')
  commitAll(work.git, 'docs: la roadmap')
  work.git('checkout', '--quiet', 'main')
  if (baseMoves) {
    work.write('src/lib/site.ts', "export const SITE = { url: '' }\n")
    commitAll(work.git, 'feat: la base va avanti')
  }
  work.git('checkout', '--quiet', '-b', 'merge')
  work.git('merge', '--quiet', '--no-ff', '--no-edit', 'pr')
  work.git('push', '--quiet', `file://${remote.dir}`, 'main', 'pr', 'merge:refs/pull/1/merge')

  const ci = repository('officina-ci-')
  ci.git('remote', 'add', 'origin', `file://${remote.dir}`)
  ci.git('fetch', '--quiet', '--depth=1', 'origin', 'refs/pull/1/merge')
  ci.git('checkout', '--quiet', '--detach', 'FETCH_HEAD')
  process.chdir(ci.dir)
  return base
}

export function stubEvent(name: string, payload: object): void {
  const file = join(tempDir('officina-event-'), 'event.json')
  writeFileSync(file, JSON.stringify(payload))
  vi.stubEnv('GITHUB_EVENT_NAME', name)
  vi.stubEnv('GITHUB_EVENT_PATH', file)
}
