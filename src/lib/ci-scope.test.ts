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

describe('ciScope', () => {
  it('con soli documenti prende il percorso veloce', () => {
    expect(ciScope('abc123', changed(['docs/ROADMAP.md', 'README.md']))).toEqual({
      docsOnly: true,
      reason: 'percorso veloce: solo documenti (2 file)',
    })
  })

  it('con solo codice prende il percorso completo, e nomina il file', () => {
    expect(ciScope('abc123', changed(['src/pages/index.astro']))).toEqual({
      docsOnly: false,
      reason: 'percorso completo: src/pages/index.astro non è un documento',
    })
  })

  it('con documenti e codice insieme prende il percorso completo', () => {
    expect(ciScope('abc123', changed(['docs/ROADMAP.md', 'src/lib/site.ts']))).toEqual({
      docsOnly: false,
      reason: 'percorso completo: src/lib/site.ts non è un documento',
    })
  })

  it("senza una base nell'evento prende il percorso completo, senza chiedere il diff", () => {
    expect(ciScope(undefined, failing('il diff non andava chiesto'))).toEqual({
      docsOnly: false,
      reason: "percorso completo: l'evento non ha una base con cui confrontarsi",
    })
  })

  it('quando il diff fallisce prende il percorso completo, con il messaggio di git', () => {
    expect(ciScope('abc123', failing('fatal: bad object abc123'))).toEqual({
      docsOnly: false,
      reason: 'percorso completo: il diff da abc123 non è riuscito: fatal: bad object abc123',
    })
  })

  it('senza file cambiati prende il percorso completo', () => {
    expect(ciScope('abc123', changed([]))).toEqual({
      docsOnly: false,
      reason: 'percorso completo: nessun file cambiato da abc123',
    })
  })
})
