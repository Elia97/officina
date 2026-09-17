import { describe, expect, it } from 'vitest'

import { classify, findingsFor, isScanned, tally } from './check-language.ts'

describe('isScanned', () => {
  it.each([
    ['docs/guides/ui-components.md', true],
    ['src/lib/site.ts', true],
    ['astro.config.mjs', true],
    ['docs/ROADMAP.md', true],
    ['docs/sources/cliente.md', false],
    ['CHANGELOG.md', false],
    ['src/i18n/strings/en.ts', false],
    ['src/pages/index.astro', true],
  ])('%s → %s', (path, expected) => {
    expect(isScanned(path)).toBe(expected)
  })
})

describe('tally', () => {
  it('conta le parole accentate', () => {
    expect(tally('già perché è più').italian).toBe(4)
  })

  it('non conta il codice citato, gli URL, i riferimenti puntati e i prefissi', () => {
    // Resta solo "su", che è italiano davvero.
    expect(tally('vedi `this.cache` e this.has() su https://the.example.com/with/the non-null')).toEqual({
      italian: 1,
      english: 0,
    })
  })
})

describe('classify', () => {
  it('resta indeciso con pochi indizi', () => {
    expect(classify({ italian: 1, english: 2 })).toBe('undecided')
  })

  it('vuole una maggioranza netta per dire inglese', () => {
    expect(classify({ italian: 5, english: 6 })).toBe('italian')
    expect(classify({ italian: 2, english: 8 })).toBe('english')
  })

  it('decide un commento troppo corto per la soglia, se non ha niente di italiano', () => {
    expect(classify({ italian: 0, english: 1 })).toBe('english')
  })

  it('resta indeciso su un commento corto che non porta nessun indizio', () => {
    expect(classify({ italian: 0, english: 0 })).toBe('undecided')
  })
})

describe('findingsFor', () => {
  it('vede un commento breve in inglese, che da solo non raggiunge la soglia', () => {
    const source = '// Native UI follows the theme\nexport const x = 1\n'
    expect(findingsFor('src/lib/x.ts', source)).toHaveLength(1)
  })

  it('lascia stare lo stesso commento in italiano', () => {
    const source = "// L'interfaccia nativa segue il tema\nexport const x = 1\n"
    expect(findingsFor('src/lib/x.ts', source)).toEqual([])
  })

  it('ignora i blocchi di codice nei markdown', () => {
    const md =
      'Questa guida spiega come avviare il progetto e cosa serve.\n\n```ts\n// this is the config that has the flags of the app\n```\n'
    expect(findingsFor('docs/guida.md', md)).toEqual([])
  })

  it('segnala un README tutto inglese', () => {
    const md = '# UI\n\nThis package contains the shared components used by the apps. It is not published.\n'
    expect(findingsFor('docs/guides/ui-components.md', md)).toHaveLength(1)
  })

  it('segnala il singolo commento inglese con la sua riga', () => {
    const src = 'const a = 1\n// Ensure the cache is warm before the first request hits the handler\nconst b = 2'
    expect(findingsFor('src/a.ts', src).map((f) => f.line)).toEqual([2])
  })

  it('segnala ogni commento breve alla sua riga', () => {
    const src =
      '// the cache\nconst a = 1\n// the handler\nconst b = 2\n// the worker\nconst c = 3\n// the router and the rest'
    expect(findingsFor('src/a.ts', src).map((f) => f.line)).toEqual([1, 3, 5, 7])
  })

  it('somma i commenti misti, che nessuno da solo decide', () => {
    const src =
      '// the cache and il worker\nconst a = 1\n// the handler and il resto\nconst b = 2\n// the router and il gestore'
    expect(findingsFor('src/a.ts', src).map((f) => f.message)).toEqual([expect.stringContaining('nel complesso')])
  })

  it('lascia in pace i commenti italiani che citano codice', () => {
    const src =
      '// se `this.cache` è vuoto, `map.has` ritorna false\nconst a = 1\n// il gestore non è idempotente per scelta'
    expect(findingsFor('src/a.ts', src)).toEqual([])
  })
})
