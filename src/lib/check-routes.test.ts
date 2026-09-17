import { describe, expect, it } from 'vitest'

import { useFixtureProject } from '../test-fixture.ts'
import { findingsFor, headings, isScanned, normalizeTitle, resolveTarget } from './check-routes.ts'

useFixtureProject()

describe('isScanned', () => {
  it.each([
    ['docs/ARCHITECTURE.md', true],
    ['CLAUDE.md', true],
    ['src/lib/site.ts', false],
    ['docs/sources/brief.md', false],
    ['docs/estimate.pdf', false],
  ])('%s → %s', (path, expected) => {
    expect(isScanned(path)).toBe(expected)
  })
})

describe('normalizeTitle', () => {
  it('toglie la formattatura che la prosa porta con sé', () => {
    expect(normalizeTitle('**The domains**')).toBe('the domains')
    expect(normalizeTitle('  `Repository` structure ')).toBe('repository structure')
  })
})

describe('headings', () => {
  it('prende i titoli dal secondo livello in giù, non il nome del documento', () => {
    const doc = '# Document\n## First\ntext\n### Second\n#### Third\n##### Fourth\n'

    expect(headings(doc)).toEqual(['first', 'second', 'third'])
  })
})

describe('resolveTarget', () => {
  it('lascia stare un percorso completo', () => {
    expect(resolveTarget('CLAUDE.md', 'docs/ARCHITECTURE.md')).toBe('docs/ARCHITECTURE.md')
  })

  it('risolve un nome nudo contro la cartella di chi cita', () => {
    expect(resolveTarget('docs/guides/seo.md', 'deploy-ops.md')).toBe('docs/guides/deploy-ops.md')
  })

  it("lascia il nome com'è quando non esiste nessun fratello", () => {
    expect(resolveTarget('docs/guides/seo.md', 'missing.md')).toBe('missing.md')
  })
})

describe('findingsFor', () => {
  it('non dice niente su un percorso che esiste', () => {
    expect(findingsFor('sample.md', 'see `docs/ARCHITECTURE.md` for the rest')).toEqual([])
  })

  it('segnala un percorso che non esiste, con la sua riga', () => {
    const doc = 'first line\nsee `src/lib/made-up.ts` and nothing else\n'

    expect(findingsFor('sample.md', doc)).toEqual([{ line: 2, message: 'percorso che non esiste: src/lib/made-up.ts' }])
  })

  it('tace sui percorsi non tracciati per scelta e sui glob', () => {
    const doc = 'in `.claude/plans/state.md`, in `docs/estimate.pdf` and in `docs/guides/*.md`'

    expect(findingsFor('sample.md', doc)).toEqual([])
  })

  it('accetta il titolo per intero', () => {
    expect(findingsFor('sample.md', 'see `docs/ARCHITECTURE.md` § Struttura del repository')).toEqual([])
  })

  it('rifiuta un titolo accorciato: un prefisso accetterebbe anche una lettera sola', () => {
    expect(findingsFor('sample.md', 'see `docs/ARCHITECTURE.md` § Struttura')).toHaveLength(1)
  })

  it('segnala una sezione che non esiste', () => {
    const finding = findingsFor('sample.md', 'see `docs/ARCHITECTURE.md` § Made-Up Section')

    expect(finding).toHaveLength(1)
    expect(finding[0]?.message).toContain('sezione che non esiste')
  })

  it('segnala una sezione dentro un file che non esiste', () => {
    const finding = findingsFor('sample.md', 'see `made-up.md` § Something')

    expect(finding).toEqual([{ line: 1, message: 'sezione in un file che non esiste: made-up.md' }])
  })

  it('un file citato per percorso e per sezione è un difetto solo', () => {
    const finding = findingsFor('sample.md', 'see `docs/made-up.md` § Something')

    expect(finding).toEqual([{ line: 1, message: 'percorso che non esiste: docs/made-up.md' }])
  })

  // I percorsi si cercano tutti prima delle sezioni, quindi senza riordino un difetto di riga 1
  // finirebbe stampato dopo uno di riga 3.
  it("riporta i difetti nell'ordine delle righe", () => {
    const doc = 'see `docs/ARCHITECTURE.md` § Made-Up Section\n\nsee `src/lib/made-up.ts`\n'

    expect(findingsFor('sample.md', doc).map((f) => f.line)).toEqual([1, 3])
  })

  it('la prosa dopo il titolo non entra nel titolo', () => {
    const doc = 'see `docs/ARCHITECTURE.md` § Struttura del repository, which labels every path'

    expect(findingsFor('sample.md', doc)).toEqual([])
  })
})
