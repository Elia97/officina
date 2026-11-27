import { describe, expect, it } from 'vitest'

import type { ProjectFiles } from './alignment.ts'
import { pullRequestGaps } from './pr-workflows.ts'

const files = (contents: Record<string, string> = {}): ProjectFiles => ({ paths: [], read: (path) => contents[path] })

const CI = '.github/workflows/ci.yml'
const RELEASE_IF = `    if: \${{ !startsWith(github.head_ref, 'release-please--') }}\n`

const ci = ({ workflow = '', job = '', fallowIf = RELEASE_IF } = {}) =>
  [
    'on:\n  pull_request:\n',
    workflow,
    'jobs:\n  ci:\n    runs-on: ubuntu-latest\n',
    job,
    '    steps:\n      - uses: Elia97/officina/actions/ci@v0.20.0\n',
    '  fallow:\n',
    fallowIf,
    '    steps:\n      - uses: Elia97/officina/actions/review@v0.20.0\n',
  ].join('')

const gaps = (contents: Record<string, string>) =>
  pullRequestGaps(files(contents)).map(({ path, message, severity }) => ({ path, severity, message }))

const READ = 'permissions:\n  contents: read\n  pull-requests: read\n  statuses: read\n'

describe('pullRequestGaps', () => {
  it('non trova niente con il permesso nel workflow, fallow fuori dalla release e nessun pr-title.yml', () => {
    expect(gaps({ [CI]: ci({ workflow: READ }) })).toEqual([])
  })

  it('accetta il permesso sul job, e read-all o write anche lì', () => {
    expect(gaps({ [CI]: ci({ job: '    permissions:\n      pull-requests: write\n      statuses: read\n' }) })).toEqual(
      [],
    )
    expect(gaps({ [CI]: ci({ job: '    permissions: read-all\n' }) })).toEqual([])
  })

  it('senza pull-requests: read è un errore, che nomina il job', () => {
    const [gap] = gaps({ [CI]: ci({ workflow: 'permissions:\n  contents: read\n' }) })

    expect(gap?.severity).toBeUndefined()
    expect(gap?.message).toMatch(/^il job `ci` usa `Elia97\/officina\/actions\/ci` senza `pull-requests: read`/)
  })

  it('i permissions del job sostituiscono quelli del workflow, come fa GitHub', () => {
    const project = { [CI]: ci({ workflow: READ, job: '    permissions:\n      contents: read\n' }) }

    expect(gaps(project).map(({ severity }) => severity)).toEqual([undefined, 'warning'])
  })

  it('senza statuses: read è un avviso: la CI non legge lo stato gate e fa il percorso completo', () => {
    const workflow = 'permissions:\n  contents: read\n  pull-requests: read\n'

    expect(gaps({ [CI]: ci({ workflow }) })).toEqual([
      {
        path: CI,
        severity: 'warning',
        message:
          'il job `ci` usa `Elia97/officina/actions/ci` senza `statuses: read`: `officina scope` non legge lo stato gate del commit, e la CI fa sempre il percorso completo',
      },
    ])
  })

  it('il job di fallow senza if sulla release è un avviso', () => {
    const [gap] = gaps({ [CI]: ci({ workflow: READ, fallowIf: '' }) })

    expect(gap).toEqual({ path: CI, severity: 'warning', message: expect.stringMatching(/^il job `fallow` usa/) })
  })

  it('un pr-title.yml rimasto è un avviso, anche senza ci.yml', () => {
    expect(gaps({ '.github/workflows/pr-title.yml': 'name: PR Title\n' })).toEqual([
      {
        path: '.github/workflows/pr-title.yml',
        severity: 'warning',
        message: 'il titolo della PR lo controlla `actions/ci`: questo workflow gira a ogni push e va tolto',
      },
    ])
  })

  it('un ci.yml che non è YAML, o senza jobs, lo lascia a chi già lo segnala', () => {
    expect(gaps({ [CI]: 'jobs: [\n' })).toEqual([])
    expect(gaps({ [CI]: 'name: CI\n' })).toEqual([])
  })
})
