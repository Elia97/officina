import { describe, expect, it } from 'vitest'

import { ciScope, isDocument } from './ci-scope.ts'

describe('isDocument', () => {
  it.each([
    'docs/ROADMAP.md',
    'docs/guides/deploy-ops.md',
    'README.md',
    'CLAUDE.md',
    'CHANGELOG.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    '.claude/agents/ui-agent.md',
  ])('%s è un documento', (path) => {
    expect(isDocument(path)).toBe(true)
  })

  it.each([
    'docs/img/schema.png',
    'docs/guides/esempi/contact.ts',
    'src/content/news/primo.md',
    'src/components/README.md',
    'package.json',
    '.github/workflows/ci.yml',
    '.claude/settings.json',
  ])('%s non è un documento', (path) => {
    expect(isDocument(path)).toBe(false)
  })
})

const changed = (paths: string[]) => () => paths

const failing = (message: string) => () => {
  throw new Error(message)
}

const PACKAGE = { name: 'atc', type: 'module', version: '1.5.5', dependencies: { astro: '6.4.0' } }

const packages =
  (head: object | string) =>
  (ref: string): string => {
    if (ref !== 'HEAD') return JSON.stringify(PACKAGE, null, 2)
    return typeof head === 'string' ? head : JSON.stringify(head, null, 2)
  }

const RELEASE = ['.release-please-manifest.json', 'CHANGELOG.md', 'package.json']

describe('ciScope', () => {
  it('con soli documenti prende il percorso veloce', () => {
    expect(ciScope('abc123', changed(['docs/ROADMAP.md', 'README.md']), failing('non va letto'))).toEqual({
      path: 'docs',
      reason: 'percorso veloce: solo documenti (2 file)',
    })
  })

  it('con solo codice prende il percorso completo, e nomina il file', () => {
    expect(ciScope('abc123', changed(['src/pages/index.astro']), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: src/pages/index.astro non è un documento',
    })
  })

  it('con documenti e codice insieme prende il percorso completo', () => {
    expect(ciScope('abc123', changed(['docs/ROADMAP.md', 'src/lib/site.ts']), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: src/lib/site.ts non è un documento',
    })
  })

  it("senza una base nell'evento prende il percorso completo, senza chiedere il diff", () => {
    expect(ciScope(undefined, failing('il diff non andava chiesto'), failing('non va letto'))).toEqual({
      path: 'full',
      reason: "percorso completo: l'evento non ha una base con cui confrontarsi",
    })
  })

  it('quando il diff fallisce prende il percorso completo, con il messaggio di git', () => {
    expect(ciScope('abc123', failing('fatal: bad object abc123'), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: il diff da abc123 non è riuscito: fatal: bad object abc123',
    })
  })

  it('senza file cambiati prende il percorso completo', () => {
    expect(ciScope('abc123', changed([]), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: nessun file cambiato da abc123',
    })
  })
})

describe('ciScope sulla PR di release', () => {
  it('con manifest, CHANGELOG.md e la sola version di package.json prende il percorso della release', () => {
    expect(ciScope('abc123', changed(RELEASE), packages({ ...PACKAGE, version: '1.5.6' }))).toEqual({
      path: 'release',
      reason: 'percorso della release: solo .release-please-manifest.json, CHANGELOG.md, package.json (version)',
    })
  })

  it('senza package.json, come in una release di tipo simple, non lo legge', () => {
    expect(
      ciScope('abc123', changed(['.release-please-manifest.json', 'CHANGELOG.md']), failing('non va letto')),
    ).toEqual({ path: 'release', reason: 'percorso della release: solo .release-please-manifest.json, CHANGELOG.md' })
  })

  it('un package.json che cambia oltre a version riporta al percorso completo', () => {
    const head = { ...PACKAGE, version: '1.5.6', dependencies: { astro: '6.5.0' } }

    expect(ciScope('abc123', changed(RELEASE), packages(head))).toEqual({
      path: 'full',
      reason: 'percorso completo: package.json cambia oltre a version',
    })
  })

  it('un file di codice in più riporta al percorso completo, e lo nomina', () => {
    expect(ciScope('abc123', changed([...RELEASE, 'src/lib/site.ts']), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: src/lib/site.ts non è un documento',
    })
  })

  it('un documento in più riporta al percorso completo: la release non porta altro', () => {
    expect(ciScope('abc123', changed([...RELEASE, 'README.md']), failing('non va letto'))).toEqual({
      path: 'full',
      reason: 'percorso completo: README.md non fa parte di una release',
    })
  })

  it('un package.json che non si legge, o non è JSON, riporta al percorso completo con il motivo', () => {
    expect(ciScope('abc123', changed(['package.json']), failing("fatal: path 'package.json' does not exist"))).toEqual({
      path: 'full',
      reason: "percorso completo: package.json non si confronta con abc123: fatal: path 'package.json' does not exist",
    })
    expect(ciScope('abc123', changed(['package.json']), packages('{ "name": ')).path).toBe('full')
  })
})
