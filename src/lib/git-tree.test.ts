import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import { commitOf, eventHead, treeOf, worktreeTree } from './git.ts'
import { cleanScopeRepos, repoWithChange, stubEvent } from './test-helpers/scope-repo.ts'

const loose: string[] = []

afterEach(() => {
  cleanScopeRepos()
  for (const dir of loose.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()

function enterLoose(prefix: string): void {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  loose.push(dir)
  process.chdir(dir)
}

describe('worktreeTree', () => {
  it('su un albero pulito è il tree di HEAD', () => {
    repoWithChange((write) => write('src/lib/nav.ts', 'export const NAV = []\n'))

    expect(worktreeTree()).toBe(treeOf('HEAD'))
  })

  it("porta modifiche e non tracciati, lascia fuori gli ignorati, e non tocca l'indice vero", () => {
    repoWithChange((write) => write('.gitignore', '.env\n'))
    writeFileSync('src/lib/site.ts', 'export const SITE = { url: "x" }\n')
    writeFileSync('nuovo.ts', 'export {}\n')
    writeFileSync('.env', 'SEGRETO=1\n')
    const status = git('status', '--porcelain')

    const tree = worktreeTree()

    expect(git('status', '--porcelain')).toBe(status)
    const paths = git('ls-tree', '-r', '--name-only', tree).split('\n')
    expect(paths).toEqual(expect.arrayContaining(['.gitignore', 'nuovo.ts', 'src/lib/site.ts']))
    expect(paths).not.toContain('.env')
    expect(git('show', `${tree}:src/lib/site.ts`)).toBe('export const SITE = { url: "x" }')
  })

  it('rifiuta un file assume-unchanged o skip-worktree, che git add non rilegge', () => {
    repoWithChange((write) => write('a.txt', 'a\n'))
    git('update-index', '--assume-unchanged', 'a.txt')
    expect(() => worktreeTree()).toThrow(
      "a.txt è assume-unchanged o skip-worktree, e il tree non lo legge dall'albero di lavoro",
    )

    git('update-index', '--no-assume-unchanged', 'a.txt')
    git('update-index', '--skip-worktree', 'docs/ROADMAP.md')
    expect(() => worktreeTree()).toThrow(/^docs\/ROADMAP\.md è assume-unchanged/)
  })

  it('in un repository senza indice, appena creato', () => {
    enterLoose('officina-tree-new-')
    git('init', '--quiet')
    writeFileSync('a.txt', 'a\n')

    expect(git('ls-tree', '--name-only', worktreeTree())).toBe('a.txt')
  })

  it('fuori da un repository lancia', () => {
    enterLoose('officina-tree-none-')

    expect(() => worktreeTree()).toThrow()
  })
})

describe('treeOf e commitOf', () => {
  it('risolvono un ref, e su un ref che non esiste lanciano', () => {
    repoWithChange((write) => write('a.txt', 'a\n'))

    expect(commitOf('HEAD')).toBe(git('rev-parse', 'HEAD'))
    expect(treeOf(commitOf('HEAD'))).toBe(git('rev-parse', 'HEAD^{tree}'))
    expect(() => commitOf('non-esiste')).toThrow()
  })
})

describe('eventHead', () => {
  it('su una PR è la head, su un push è after', () => {
    stubEvent('pull_request', { pull_request: { base: { sha: 'b1' }, head: { sha: 'h1' } } })
    expect(eventHead()).toBe('h1')

    stubEvent('push', { before: 'b2', after: 'a2' })
    expect(eventHead()).toBe('a2')
  })

  it('niente su un push che cancella il branch, senza after o su un altro evento', () => {
    stubEvent('push', { after: '0000000000000000000000000000000000000000' })
    expect(eventHead()).toBeUndefined()

    stubEvent('push', {})
    expect(eventHead()).toBeUndefined()

    stubEvent('workflow_dispatch', { after: 'a3' })
    expect(eventHead()).toBeUndefined()
  })
})
