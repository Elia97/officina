import { afterEach, describe, expect, it } from 'vitest'

import { changedSince, eventBase } from './git.ts'
import { cleanScopeRepos, repoWithChange, stubEvent } from './test-helpers/scope-repo.ts'

afterEach(cleanScopeRepos)

describe('eventBase', () => {
  it('su una pull request è la base della PR', () => {
    stubEvent('pull_request', { pull_request: { base: { sha: 'aaa111' }, head: { sha: 'bbb222' } } })

    expect(eventBase()).toBe('aaa111')
  })

  it('su un push è il commit before', () => {
    stubEvent('push', { before: 'ccc333' })

    expect(eventBase()).toBe('ccc333')
  })

  it('sul primo push di un branch, con before tutto zeri, non c’è', () => {
    stubEvent('push', { before: '0000000000000000000000000000000000000000' })

    expect(eventBase()).toBeUndefined()
  })

  it('fuori da GitHub Actions, o su un altro evento, non c’è', () => {
    expect(eventBase()).toBeUndefined()

    stubEvent('workflow_dispatch', { before: 'ccc333' })

    expect(eventBase()).toBeUndefined()
  })
})

describe('changedSince', () => {
  it('elenca i file cambiati dalla base, anche quelli cancellati', () => {
    const base = repoWithChange((write, git) => {
      write('docs/ROADMAP.md', '# Roadmap\n\nMilestone 1\n')
      git('rm', '--quiet', 'src/lib/site.ts')
    })

    expect(changedSince(base)).toEqual(['docs/ROADMAP.md', 'src/lib/site.ts'])
  })

  it('conta uno spostamento come una cancellazione più un’aggiunta', () => {
    const base = repoWithChange((_, git) => git('mv', 'src/lib/site.ts', 'docs/site.ts'))

    expect(changedSince(base)).toEqual(['docs/site.ts', 'src/lib/site.ts'])
  })

  it('fallisce su una base che manca, senza un remote da cui scaricarla', () => {
    repoWithChange((write) => write('README.md', '# Prova\n'))

    expect(() => changedSince('0123456789abcdef0123456789abcdef01234567')).toThrow()
  })
})
