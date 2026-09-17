import { describe, expect, it } from 'vitest'

import { isNoisy, report } from './check-comments.ts'
import { commentBlocks, type Line, styleOf } from './comment-syntax.ts'

const lines = (src: string): Line[] => src.split('\n').map((text, i) => ({ n: i + 1, text }))
const messages = (file: string, src: string) => report(file, lines(src)).findings.map((f) => `${f.line}: ${f.message}`)

describe('commentBlocks', () => {
  it('tiene insieme le righe interne di un blocco anche senza asterisco', () => {
    const blocks = commentBlocks(lines('/*\n  uno\n  due\n*/\nconst x = 1'), 'slash')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.lines.map((l) => l.n)).toEqual([1, 2, 3, 4])
  })

  it('riconosce i commenti HTML solo negli .astro', () => {
    expect(commentBlocks(lines('<!-- x -->'), 'astro')).toHaveLength(1)
    expect(commentBlocks(lines('<!-- x -->'), 'slash')).toHaveLength(0)
  })

  it('un commento in coda non forma un blocco e ignora le stringhe con //', () => {
    const blocks = commentBlocks(lines('const a = 1 // nota\nconst u = "http://x"'), 'slash')
    expect(blocks).toEqual([{ lines: [{ n: 1, text: '// nota' }], trailing: true }])
  })

  it.each([
    ['const m = "L\'esperienza non è disponibile" // nota', '// nota'],
    ["const s = 'a \\' b' // nota", '// nota'],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: il ${} nella stringa è il caso in prova
    ['const t = `a ${"b"} c` // nota', '// nota'],
    ['const x = 1 /* nota */', '/* nota */'],
    ['const u = "http://x"', null],
    ['const r = /https?:\\/\\//', null],
  ])('in coda: %s', (src, expected) => {
    const [block] = commentBlocks(lines(src), 'slash')
    expect(block?.lines[0]?.text ?? null).toBe(expected)
  })

  it('in YAML "#" apre un commento solo dopo uno spazio', () => {
    expect(commentBlocks(lines('url: http://x#frag'), 'hash')).toHaveLength(0)
    expect(commentBlocks(lines('key: "a # b" # nota'), 'hash')[0]?.lines[0]?.text).toBe('# nota')
  })

  it('nel CSS il selettore universale non è un commento', () => {
    expect(commentBlocks(lines('* { margin: 0 }\n*:not(.x) { }'), 'css')).toHaveLength(0)
  })
})

describe('report: lunghezza del blocco', () => {
  it('conta solo le righe di prosa, non i delimitatori né le direttive', () => {
    expect(messages('a.ts', '/*\n * una riga\n */')).toEqual([])
    expect(messages('a.ts', '// biome-ignore lint/x: motivo\n// una\n// due')).toEqual([])
    expect(messages('a.ts', '/*\n  uno\n  due\n  tre\n*/')).toEqual(['1: blocco di 3 righe di prosa (max 2)'])
  })

  it('un marcatore esenta la sua riga, non il blocco', () => {
    expect(messages('a.ts', '// uno\n// [HARD] due\n// tre\n// quattro')).toHaveLength(1)
  })
})

describe('report: tempo verbale', () => {
  it.each([
    ['// questo non più usato', true],
    ['// accetta non più di 3 tentativi', false],
    ['// ora lo usa il worker', true],
    ['// ora loro sono contenti', false],
    ['// vedi #12', true],
    ['// colore #123456', false],
    ['const x = 1 // prima era 2', true],
    ['key: value # previously unused', true],
  ])('%s → %s', (src, flagged) => {
    const file = src.startsWith('key') ? 'a.yml' : 'a.ts'
    expect(messages(file, src).some((m) => m.includes('racconta'))).toBe(flagged)
  })
})

describe('isNoisy', () => {
  it('ignora i file corti e conta solo le righe che sono commento', () => {
    const short = report('a.ts', lines('// a\n// b\nconst x = 1'))
    expect(isNoisy(short)).toBe(false)
    const long = report('a.ts', lines(Array.from({ length: 50 }, (_, i) => (i < 10 ? '// c' : 'x')).join('\n')))
    expect(isNoisy(long)).toBe(true)
  })
})

describe('styleOf', () => {
  it.each([
    ['docker-compose.yml', 'hash'],
    ['deploy.sh', 'hash'],
    ['globals.css', 'css'],
    ['Card.astro', 'astro'],
    ['index.ts', 'slash'],
  ])('%s usa i commenti in stile %s', (file, expected) => {
    expect(styleOf(file)).toBe(expected)
  })
})

describe('aperture di commento per stile', () => {
  const commentCount = (file: string, text: string) => report(file, lines(text)).comments

  it('in CSS le due barre non aprono un commento', () => {
    expect(commentCount('a.css', '// non è un commento\n')).toBe(0)
    expect(commentCount('a.css', '/* questo sì */\n')).toBe(1)
  })

  it('riconosce il commento JSX, che apre con una graffa', () => {
    expect(commentCount('a.tsx', '{/* commento */}\n')).toBe(1)
  })

  it('in uno script shell lo shebang non è un commento', () => {
    expect(commentCount('a.sh', '#!/usr/bin/env bash\n# questo sì\n')).toBe(1)
  })

  it('in Astro riconosce il commento del markup', () => {
    expect(commentCount('a.astro', '<!-- commento -->\n')).toBe(1)
  })
})

describe('ordine dei ritrovamenti', () => {
  // Il report ordina per riga: senza, un blocco lungo trovato dopo un verbo al passato uscirebbe
  // prima di lui, e chi legge l'elenco non ritrova la sequenza del file.
  it("elenca i problemi nell'ordine in cui compaiono nel file", () => {
    const source = [
      '// Prima riga di prosa lunga che continua',
      '// su una seconda riga di prosa',
      '// e anche su una terza riga di prosa.',
      'const a = 1',
      '// In precedenza questo controllo non esisteva.',
      'const b = 2',
    ].join('\n')

    const lineNumbers = report('a.ts', lines(source)).findings.map((f) => f.line)
    expect(lineNumbers).toEqual([...lineNumbers].sort((x, y) => x - y))
    expect(lineNumbers.length).toBeGreaterThan(1)
  })
})
