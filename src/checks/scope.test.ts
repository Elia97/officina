import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanFakeGh, useFakeGh } from '../lib/test-helpers/fake-gh.ts'
import { cleanScopeRepos, repoWithChange, stubEvent } from '../lib/test-helpers/scope-repo.ts'
import { main as scope } from './scope.ts'

afterEach(() => {
  cleanFakeGh()
  cleanScopeRepos()
})

function run(): { code: number; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void err.push(line))
  const code = scope()
  vi.restoreAllMocks()
  return { code, out, err }
}

const packageJson = (version: string, astro = '6.4.0') =>
  `${JSON.stringify({ name: 'atc', version, dependencies: { astro } }, null, 2)}\n`

const RELEASE_BASE = {
  'package.json': packageJson('1.5.5'),
  '.release-please-manifest.json': '{".":"1.5.5"}\n',
  'CHANGELOG.md': '# Changelog\n',
}

describe('officina scope su un push', () => {
  it('di soli documenti stampa docs-only=true, e la ragione su stderr', () => {
    const before = repoWithChange((write) => write('docs/ARCHITECTURE.md', '# Architettura\n'))
    stubEvent('push', { before })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=true', 'release-only=false', 'gate=false'],
      err: ['percorso veloce: solo documenti (1 file)'],
    })
  })

  it('che tocca il codice stampa docs-only=false, e nomina il file', () => {
    const before = repoWithChange((write) => write('src/lib/site.ts', "export const SITE = { url: '' }\n"))
    stubEvent('push', { before })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=false', 'release-only=false', 'gate=false'],
      err: [
        "percorso completo: src/lib/site.ts non è un documento; l'evento non ha un commit di cui leggere lo stato gate",
      ],
    })
  })

  it('di una release stampa release-only=true, leggendo package.json alla base e al commit', () => {
    const before = repoWithChange((write) => {
      write('package.json', packageJson('1.5.6'))
      write('.release-please-manifest.json', '{".":"1.5.6"}\n')
      write('CHANGELOG.md', '# Changelog\n\n## 1.5.6\n')
    }, RELEASE_BASE)
    stubEvent('push', { before })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=false', 'release-only=true', 'gate=false'],
      err: ['percorso della release: solo .release-please-manifest.json, CHANGELOG.md, package.json (version)'],
    })
  })

  it('di una release che cambia anche una dipendenza stampa release-only=false, e dice perché', () => {
    const before = repoWithChange((write) => write('package.json', packageJson('1.5.6', '6.5.0')), RELEASE_BASE)
    stubEvent('push', { before })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=false', 'release-only=false', 'gate=false'],
      err: [
        "percorso completo: package.json cambia oltre a version; l'evento non ha un commit di cui leggere lo stato gate",
      ],
    })
  })
})

describe('officina scope con lo stato gate', () => {
  it('che tocca il codice, con lo stato gate verde sul commit e lo stesso tree, stampa gate=true', () => {
    const before = repoWithChange((write) => write('src/lib/site.ts', "export const SITE = { url: '' }\n"))
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim()
    const after = git('rev-parse', 'HEAD')
    stubEvent('push', { before, after })
    useFakeGh({
      FAKE_GH_STATUS: JSON.stringify({ statuses: [{ context: 'gate', state: 'success' }] }),
      FAKE_GH_TREE: git('rev-parse', 'HEAD^{tree}'),
    })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=false', 'release-only=false', 'gate=true'],
      err: [`percorso del gate: stato gate verde su ${after.slice(0, 7)}, con il tree del checkout`],
    })
  })
})
