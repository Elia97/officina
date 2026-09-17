import { describe, expect, it } from 'vitest'

import { findingsFor, parseDays, sections, statusRows, subtotals } from './check-roadmap.ts'

const ROADMAP = `# Roadmap

## Status

| # | Milestone | Fase | gg | Status |
|---|---|:-:|:-:|---|
| 1 | Fondamenta | 1 | 1 | 🔲 planned |
| 2 | Catalogo | 1 | 1,5 | 🔲 planned |
| | **FASE 1 — go-live** | | **2,5** | |
| 3 | Area B2B | 2 | 2 | 🔲 planned |
| | **FASE 2 — B2B** | | **2** | |
| | **TOTALE** | | **4,5** | |

## Milestone 1 — Fondamenta

**GitHub Milestone:** *(da seedare)*
**Fase 1** · **1 gg**

## Milestone 2 — Catalogo

**GitHub Milestone:** *(da seedare)*
**Fase 1** · **1,5 gg** *(3 pagine)*

## Milestone 3 — Area B2B

**GitHub Milestone:** *(da seedare)*
**Fase 2** · **2 gg** · 🔒
`

describe('parseDays', () => {
  it('legge la virgola decimale italiana', () => {
    expect(parseDays(' 1,5 ')).toBe(1.5)
    expect(parseDays('3')).toBe(3)
  })
})

describe('statusRows', () => {
  it('prende una riga per milestone, non i subtotali', () => {
    expect(statusRows(ROADMAP).map((r) => [r.number, r.days, r.phase])).toEqual([
      [1, 1, 1],
      [2, 1.5, 1],
      [3, 2, 2],
    ])
  })

  it('salta una riga senza giornate leggibili', () => {
    expect(statusRows('| 9 | Senza numero | 1 | — | 🔲 |')).toEqual([])
  })

  it('salta una riga a cui manca la colonna delle giornate', () => {
    expect(statusRows('| 9 | Tabella tagliata |')).toEqual([])
  })
})

describe('subtotals', () => {
  it('prende i totali di fase e quello generale', () => {
    expect(subtotals(ROADMAP).map((s) => [s.phase, s.days])).toEqual([
      [1, 2.5],
      [2, 2],
      [null, 4.5],
    ])
  })

  it('salta una riga di somma senza un numero', () => {
    expect(subtotals('| | **TOTALE** | | **—** | |')).toEqual([])
  })

  it('salta una riga di somma a cui manca la colonna', () => {
    expect(subtotals('| | **TOTALE** |')).toEqual([])
  })
})

describe('sections', () => {
  it('legge fase e giornate dalla testata sotto il titolo', () => {
    expect(sections(ROADMAP).map((s) => [s.number, s.days, s.phase])).toEqual([
      [1, 1, 1],
      [2, 1.5, 1],
      [3, 2, 2],
    ])
  })

  it('salta una sezione che non porta la testata', () => {
    expect(sections('## Milestone 7 — Senza testata\n\ntesto qualunque\n')).toEqual([])
  })
})

describe('findingsFor', () => {
  it('tace quando tabella e sezioni concordano', () => {
    expect(findingsFor(ROADMAP)).toEqual([])
  })

  it('tace su una roadmap che non ha ancora milestone', () => {
    expect(findingsFor('# Roadmap\n\n## Status\n\nDa scrivere.\n')).toEqual([])
  })

  it('somma le milestone e confronta con il totale dichiarato', () => {
    const finding = findingsFor(ROADMAP.replace('**4,5**', '**5**'))

    expect(finding).toHaveLength(1)
    expect(finding[0]?.message).toBe('TOTALE: la riga dice 5 ma le milestone sommano 4.5')
  })

  it('confronta le giornate della tabella con quelle della sezione', () => {
    const finding = findingsFor(ROADMAP.replace('**Fase 2** · **2 gg**', '**Fase 2** · **3 gg**'))

    expect(finding.map((f) => f.message)).toContain('milestone 3: la tabella dice 2 gg, la sezione 3')
  })

  it('confronta anche la fase', () => {
    const finding = findingsFor(ROADMAP.replace('**Fase 2** · **2 gg**', '**Fase 1** · **2 gg**'))

    expect(finding.map((f) => f.message)).toContain('milestone 3: la tabella la mette in fase 2, la sezione in fase 1')
  })

  it('segnala una milestone in tabella che non ha una sezione', () => {
    const finding = findingsFor(ROADMAP.replace('## Milestone 3 — Area B2B', '## Milestone 30 — Area B2B'))

    expect(finding.map((f) => f.message)).toContain('milestone 3 in tabella ma senza sezione')
    expect(finding.map((f) => f.message)).toContain('milestone 30 ha una sezione ma non è in tabella')
  })
})
