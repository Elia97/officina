import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import { changedSince } from './git.ts'
import { cleanScopeRepos, shallowPullRequest } from './test-helpers/scope-repo.ts'

afterEach(cleanScopeRepos)

const hasCommit = (sha: string) => spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`]).status === 0
const isShallow = () => execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim()

describe('changedSince sul checkout shallow del merge commit di una PR', () => {
  it('scarica la sola base, resta shallow, e vede soltanto i file della PR', () => {
    const base = shallowPullRequest()

    expect(hasCommit(base)).toBe(false)
    expect(changedSince(base)).toEqual(['docs/ROADMAP.md'])
    expect(isShallow()).toBe('true')
  })

  it('con la base andata avanti porta anche il codice nuovo della base, quindi il percorso completo', () => {
    const base = shallowPullRequest({ baseMoves: true })

    expect(changedSince(base)).toEqual(['docs/ROADMAP.md', 'src/lib/site.ts'])
  })
})
