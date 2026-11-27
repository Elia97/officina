import { writeFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { type GateSources, gatePassed, gateScope, gateSources } from './ci-gate.ts'
import type { CiScope } from './ci-scope.ts'
import { treeOf } from './git.ts'
import { cleanFakeGh, useFakeGh } from './test-helpers/fake-gh.ts'
import { cleanScopeRepos, repoWithChange, stubEvent } from './test-helpers/scope-repo.ts'

afterEach(() => {
  cleanFakeGh()
  cleanScopeRepos()
})

const HEAD = 'd'.repeat(40)
const TREE = 'e'.repeat(40)
const FULL: CiScope = { path: 'full', reason: 'percorso completo: src/a.ts non è un documento' }
const GREEN = {
  statuses: [
    { context: 'lint', state: 'failure' },
    { context: 'gate', state: 'success' },
  ],
}

const sources = (overrides: Partial<GateSources> = {}): GateSources => ({
  migrate: '',
  scripts: () => ({}),
  head: HEAD,
  statuses: () => GREEN,
  commitTree: () => TREE,
  checkoutTree: () => TREE,
  ...overrides,
})

const reason = (overrides: Partial<GateSources>) => gateScope(FULL, sources(overrides)).reason

describe('gatePassed', () => {
  it('vuole il contesto gate a success fra gli stati combinati', () => {
    expect(gatePassed(GREEN)).toBe(true)
    expect(gatePassed({ statuses: [{ context: 'gate', state: 'failure' }] })).toBe(false)
    expect(gatePassed({ statuses: [{ context: 'altro', state: 'success' }, 'x'] })).toBe(false)
    expect(gatePassed({ statuses: 'x' })).toBe(false)
    expect(gatePassed(null)).toBe(false)
  })
})

describe('gateScope', () => {
  it('con lo stato verde e lo stesso tree sceglie il percorso del gate', () => {
    expect(gateScope(FULL, sources())).toEqual({
      path: 'gate',
      reason: 'percorso del gate: stato gate verde su ddddddd, con il tree del checkout',
    })
    expect(
      gateScope(FULL, sources({ migrate: 'db:migrate', scripts: () => ({ 'test:integration': 'vitest' }) })).path,
    ).toBe('gate')
  })

  it('in ogni altro caso resta sul completo, e la ragione dice perché', () => {
    const fail = () => {
      throw new Error('HTTP 403')
    }

    expect(reason({ migrate: 'db:migrate' })).toBe(
      `${FULL.reason}; con migrate il percorso del gate vuole lo script test:integration`,
    )
    expect(reason({ head: undefined })).toBe(`${FULL.reason}; l'evento non ha un commit di cui leggere lo stato gate`)
    expect(reason({ statuses: fail })).toBe(
      `${FULL.reason}; lo stato gate non si verifica, e il job vuole statuses: read: HTTP 403`,
    )
    expect(
      reason({
        commitTree: () => {
          throw new Error('HTTP 404: Not Found')
        },
      }),
    ).toBe(`${FULL.reason}; lo stato gate non si verifica: HTTP 404: Not Found`)
    expect(reason({ statuses: () => ({ statuses: [] }) })).toBe(`${FULL.reason}; nessuno stato gate verde su ddddddd`)
    expect(reason({ checkoutTree: () => 'f'.repeat(40) })).toBe(
      `${FULL.reason}; il checkout non ha il tree di ddddddd: la base è andata avanti dopo il gate`,
    )
    expect(gateScope(FULL, sources({ head: undefined })).path).toBe('full')
  })
})

describe('gateSources', () => {
  it('legge migrate, gli script, la head, gli stati e il tree dal commit su GitHub', () => {
    repoWithChange((write) => write('package.json', '{"scripts":{"test:integration":"vitest run test/integration"}}'))
    stubEvent('pull_request', { pull_request: { base: { sha: 'b' }, head: { sha: HEAD } } })
    const calls = useFakeGh({
      OFFICINA_MIGRATE: 'db:migrate',
      FAKE_GH_STATUS: JSON.stringify(GREEN),
      FAKE_GH_TREE: TREE,
    })
    const real = gateSources()

    expect(real.migrate).toBe('db:migrate')
    expect(real.head).toBe(HEAD)
    expect(real.scripts()).toEqual({ 'test:integration': 'vitest run test/integration' })
    expect(real.statuses(HEAD)).toEqual(GREEN)
    expect(real.commitTree(HEAD)).toBe(TREE)
    expect(real.checkoutTree()).toBe(treeOf('HEAD'))
    expect(calls()).toEqual([
      `api repos/{owner}/{repo}/commits/${HEAD}/status`,
      `api repos/{owner}/{repo}/git/commits/${HEAD} --jq .tree.sha`,
    ])
  })

  it('senza migrate, e con un package.json senza script o illeggibile, gli script sono vuoti', () => {
    repoWithChange((write) => write('package.json', '{"scripts":"x"}'))
    vi.stubEnv('OFFICINA_MIGRATE', undefined)

    expect(gateSources().migrate).toBe('')
    expect(gateSources().scripts()).toEqual({})
    writeFileSync('package.json', '{')
    expect(gateSources().scripts()).toEqual({})
  })
})
