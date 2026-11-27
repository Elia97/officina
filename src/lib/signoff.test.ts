import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { annotation, type SignoffSources, signoff, signoffSources, VERIFIED_TREE } from './signoff.ts'
import { cleanFakeGh, useFakeGh } from './test-helpers/fake-gh.ts'
import { cleanScopeRepos, repoWithChange } from './test-helpers/scope-repo.ts'

afterEach(() => {
  cleanFakeGh()
  cleanScopeRepos()
})

const TREE = 'a'.repeat(40)
const OTHER = 'b'.repeat(40)
const SHA = 'c'.repeat(40)

describe('annotation', () => {
  it('annota il tree se è lo stesso prima e dopo il gate', () => {
    expect(annotation({ tree: TREE }, { tree: TREE })).toEqual({
      tree: TREE,
      line: '  Tree aaaaaaa annotato: officina signoff pubblica lo stato gate sul commit che lo porta.',
    })
  })

  it('non annota fuori da git, prima o dopo, né con un albero cambiato durante la corsa', () => {
    expect(annotation({ error: 'fatal: not a git repository' }, { tree: TREE })).toEqual({
      line: '  Tree non annotato: fatal: not a git repository',
    })
    expect(annotation({ tree: TREE }, { error: 'index.lock' })).toEqual({ line: '  Tree non annotato: index.lock' })
    expect(annotation({ tree: TREE }, { tree: OTHER })).toEqual({
      line: "  Tree non annotato: l'albero di lavoro è cambiato durante il gate",
    })
  })
})

const sources = (overrides: Partial<SignoffSources> = {}): SignoffSources => ({
  verified: () => TREE,
  commit: () => SHA,
  tree: () => TREE,
  publish: () => undefined,
  ...overrides,
})

describe('signoff', () => {
  it('pubblica lo stato quando il tree del commit è quello del gate verde', () => {
    const publish = vi.fn()

    expect(signoff('HEAD', sources({ publish }))).toEqual({
      ok: true,
      message: '✓ signoff — stato gate verde su ccccccc, tree aaaaaaa.',
    })
    expect(publish).toHaveBeenCalledWith(SHA, TREE)
  })

  it('senza un gate verde annotato chiede di lanciarlo', () => {
    expect(signoff('HEAD', sources({ verified: () => undefined })).message).toBe(
      '✗ signoff — nessun gate verde annotato in questo checkout: lancia `officina gate`.',
    )
  })

  it('con un ref che non è un commit lo nomina', () => {
    const commit = () => {
      throw new Error('git rev-parse fallito')
    }

    expect(signoff('nope', sources({ commit }))).toEqual({
      ok: false,
      message: '✗ signoff — nope non è un commit: git rev-parse fallito.',
    })
  })

  it('con un altro tree non pubblica, e nomina i due tree', () => {
    const publish = vi.fn()
    const { ok, message } = signoff('HEAD', sources({ tree: () => OTHER, publish }))

    expect(ok).toBe(false)
    expect(message).toMatch(/^✗ signoff — il tree di ccccccc è bbbbbbb, il gate verde ha verificato aaaaaaa: /)
    expect(publish).not.toHaveBeenCalled()
  })

  it('se GitHub rifiuta lo stato lo dice, con il motivo', () => {
    const publish = () => {
      throw new Error('HTTP 422: No commit found for SHA')
    }

    expect(signoff('HEAD', sources({ publish })).message).toBe(
      '✗ signoff — GitHub non ha accettato lo stato su ccccccc, che va pubblicato dopo il push: HTTP 422: No commit found for SHA.',
    )
  })
})

describe('signoffSources', () => {
  it("legge l'annotazione del gate, e senza file o con un file vuoto non c'è", () => {
    repoWithChange((write) => write('a.txt', 'a\n'))
    const { verified } = signoffSources()

    expect(verified()).toBeUndefined()
    mkdirSync(dirname(VERIFIED_TREE), { recursive: true })
    writeFileSync(VERIFIED_TREE, '\n')
    expect(verified()).toBeUndefined()
    writeFileSync(VERIFIED_TREE, `${TREE}\n`)
    expect(verified()).toBe(TREE)
  })

  it('pubblica con gh lo stato gate a success sullo sha', () => {
    const calls = useFakeGh()

    signoffSources().publish(SHA, TREE)

    expect(calls()).toEqual([
      `api --method POST repos/{owner}/{repo}/statuses/${SHA} -f state=success -f context=gate -f description=officina gate verde in locale sul tree aaaaaaa`,
    ])
  })
})
