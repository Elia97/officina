import { describe, expect, it } from 'vitest'

import { useFixtureProject } from '../test-fixture.ts'
import { findingsFor } from './check-routes.ts'

useFixtureProject()

const missing = (line: number, target: string) => ({ line, message: `percorso che non esiste: ${target}` })

describe('findingsFor: i link markdown', () => {
  it('segue i link relativi, anche verso una cartella e verso la cartella sopra', () => {
    expect(findingsFor('README.md', 'vedi [seo](docs/guides/seo.md) e [guide](docs/guides/)')).toEqual([])
    expect(findingsFor('docs/guides/seo.md', 'vedi [architettura](../ARCHITECTURE.md#domini)')).toEqual([])
  })

  it('segnala un link che non risolve alla riga dove si chiude', () => {
    const doc = 'Nota [bozza\n\nvedi [guida](HOW_TO_USE.md)\n'

    expect(findingsFor('README.md', doc)).toEqual([missing(3, 'HOW_TO_USE.md')])
  })

  it.each([
    ["esce dal repository, dove in CI la cartella sopra non c'è", '[fuori](../altro/README.md)', '../altro/README.md'],
    ['sale di una cartella dalla radice', '[su](..)', '..'],
  ])('segnala un link che %s', (_, doc, target) => {
    expect(findingsFor('README.md', doc)).toEqual([missing(1, target)])
  })

  it.each([
    ['un URL', '[sito](https://example.com/x.md)'],
    ["un'ancora dello stesso file", '[sotto](#domini)'],
    ['una rotta del sito', '[contatti](/contatti)'],
    ['uno schema', '![foto](cld:hero/cover)'],
    ['uno span di codice', 'scrivi `[testo](made-up.md)`'],
    ['uno span che va a capo', 'la sintassi: `![](src\n  "full-width")` e basta'],
    ['un blocco di codice', '```md\n[testo](made-up.md)\n```'],
  ])('lascia fuori %s', (_, doc) => {
    expect(findingsFor('README.md', doc)).toEqual([])
  })

  it('lascia fuori i link dei Markdown di src/content/, che sono URL del sito', () => {
    expect(findingsFor('src/content/news/x.md', '[altra notizia](altra-notizia)')).toEqual([])
  })

  it("un link che non risolve non spegne il rimando a sezione di un'altra riga", () => {
    expect(findingsFor('README.md', '[guida](guida.md)\n\nvedi `guida.md` § Uso\n')).toEqual([
      missing(1, 'guida.md'),
      { line: 3, message: 'sezione in un file che non esiste: guida.md' },
    ])
  })
})

describe('findingsFor: i nomi senza cartella', () => {
  it('segnala un documento in maiuscolo che non si trova', () => {
    expect(findingsFor('docs/guides/deploy-ops.md', 'vedi `HOW_TO_USE.md`')).toEqual([missing(1, 'HOW_TO_USE.md')])
  })

  it('cerca il documento anche alla radice e in docs/', () => {
    expect(findingsFor('CLAUDE.md', 'vedi `ARCHITECTURE.md` e `README.md`')).toEqual([])
  })

  it('controlla i file di configurazione della radice di vetrina e drizzle.config.ts, e nessun altro nome', () => {
    const doc = '`vercel.json`, `package.json`, `drizzle.config.ts`, `property-detail.astro`, `site.ts`'

    expect(findingsFor('README.md', doc)).toEqual([missing(1, 'vercel.json'), missing(1, 'drizzle.config.ts')])
  })

  it.each([
    ['nella roadmap', 'docs/ROADMAP.md', 'fuori con loro `GUIDA-EDITOR.md`'],
    ['in un CHANGELOG', 'CHANGELOG.md', 'fuori con loro `GUIDA-EDITOR.md`'],
    ['nel contenuto del sito', 'src/content/blog/x.md', 'crea un `CONTRIBUTING.md`'],
    ['in un blocco di codice', 'README.md', '```md\nvedi `GUIDA.md`\n```'],
    [
      'nel testo di un link esterno',
      'README.md',
      'il [`CONTRIBUTING.md` di Astro](https://github.com/withastro/astro)',
    ],
  ])('un nome %s non si controlla', (_, path, doc) => {
    expect(findingsFor(path, doc)).toEqual([])
  })

  it('un nome che fa da testo al suo link conta una volta, con la destinazione del link', () => {
    const doc = 'vedi [`HOW_TO_USE.md`](HOW_TO_USE.md)'

    expect(findingsFor('README.md', doc)).toEqual([missing(1, 'HOW_TO_USE.md')])
    expect(findingsFor('docs/guides/deploy-ops.md', doc)).toEqual([missing(1, 'docs/guides/HOW_TO_USE.md')])
  })

  it('un documento che manca, citato per sezione, è un difetto solo', () => {
    expect(findingsFor('README.md', 'vedi `PROJECT.md` § Stato')).toEqual([missing(1, 'PROJECT.md')])
  })

  it('i percorsi conoscono anche e2e/', () => {
    expect(findingsFor('README.md', 'vedi `e2e/support.ts`')).toEqual([missing(1, 'e2e/support.ts')])
  })
})
