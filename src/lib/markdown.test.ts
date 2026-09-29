import { describe, expect, it } from 'vitest'

import { blankFences, blankSpans, linkDestinations } from './markdown.ts'

const destinations = (text: string) => linkDestinations(text).map(({ destination }) => destination)

describe('blankFences', () => {
  it('sbianca un blocco recintato, recinti compresi, e lascia le righe dove sono', () => {
    const source = 'prima\n```md\n[x](a.md)\n```\ndopo'

    expect(blankFences(source).split('\n')).toEqual(['prima', '     ', '         ', '   ', 'dopo'])
  })

  it.each([
    ['con le tilde', '~~~\n[x](a.md)\n~~~\ndopo'],
    ['chiuso da un recinto più lungo', '```\n[x](a.md)\n`````\ndopo'],
    ['che contiene un recinto più corto', '````\n```\n[x](a.md)\n````\ndopo'],
    ["che contiene un recinto dell'altro carattere", '```\n~~~\n[x](a.md)\n```\ndopo'],
    ['che contiene un recinto seguito da un testo', '```\n``` js\n[x](a.md)\n```\ndopo'],
  ])('riconosce un blocco %s', (_, source) => {
    expect(blankFences(source).trim()).toBe('dopo')
  })

  it('tiene aperto fino alla fine un blocco senza recinto di chiusura', () => {
    expect(blankFences('testo\n```\n[x](a.md)').trim()).toBe('testo')
  })

  it('non apre un blocco con un recinto a metà riga', () => {
    expect(blankFences('scrivi ``` e poi\n[x](a.md)')).toBe('scrivi ``` e poi\n[x](a.md)')
  })
})

describe('blankSpans', () => {
  it.each([
    ['uno span semplice', 'a `[x](b.md)` c'],
    ['uno span di due apici che ne contiene uno', 'a ``[x](b.md) ` `` c'],
    ['uno span che va a capo', 'a `[x](b.md)\n  "titolo"` c'],
  ])('sbianca %s senza cambiare la lunghezza', (_, text) => {
    const blanked = blankSpans(text)

    expect(blanked).toHaveLength(text.length)
    expect(blanked).not.toContain('b.md')
  })

  it('non attraversa una riga vuota: un apice senza compagno resta testo', () => {
    expect(blankSpans('a `x\n\ny` b')).toBe('a `x\n\ny` b')
  })
})

describe('linkDestinations', () => {
  it.each([
    ['un link', '[x](a.md)', 'a.md'],
    ["un'immagine", '![x](img/a.png)', 'img/a.png'],
    ['un titolo fra virgolette', '[x](a.md "titolo")', 'a.md'],
    ['un titolo fra apici', "[x](a.md 'titolo')", 'a.md'],
    ['un titolo fra parentesi', '[x](a.md (titolo))', 'a.md'],
    ['gli spazi dentro le parentesi', '[x]( a.md )', 'a.md'],
    ['una destinazione fra <> con uno spazio', '![x](<img/a b.svg>)', 'img/a b.svg'],
    ['un %20', '![x](img/a%20b.svg)', 'img/a b.svg'],
    ['un escape', '[x](a\\.md)', 'a.md'],
    ['le parentesi bilanciate', '[x](a(v2).md)', 'a(v2).md'],
    ['una definizione a riferimento', 'vedi [x][g]\n\n[g]: a.md', 'a.md'],
  ])('legge %s', (_, text, destination) => {
    expect(destinations(text)).toEqual([destination])
  })

  it("legge sia il link sia l'immagine che contiene", () => {
    expect(destinations('[![x](img/a.png)](a.md)')).toEqual(['img/a.png', 'a.md'])
  })

  it("lascia com'è un % che non si decodifica", () => {
    expect(destinations('[x](a%E0%A4%A.md)')).toEqual(['a%E0%A4%A.md'])
  })

  it('dà la posizione della chiusura del testo, anche quando il testo va a capo', () => {
    expect(linkDestinations('[una\nguida](a.md)')).toEqual([{ index: 10, destination: 'a.md' }])
  })
})
