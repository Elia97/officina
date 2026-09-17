import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { cleanupRoots, makeRoot } from '../gen/test-helpers/gen-fixture.ts'
import { anchorGaps } from './anchors.ts'

const CONFIG = 'src/content.config.ts'
const BARREL = 'src/lib/schemas/homepage/index.ts'
const DATA = 'src/lib/homepage.ts'
const PAGE = 'src/pages/index.astro'
const IT = 'src/i18n/strings/it.ts'

const gapsOn = (overrides: Record<string, string | null> = {}) => anchorGaps(makeRoot(overrides))

afterEach(cleanupRoots)

describe('gli ancoraggi del barrel e dello strato dati', () => {
  it('sul progetto di prova non trova niente da segnalare', () => {
    expect(gapsOn()).toEqual([])
  })

  it('segnala il barrel che ha perso la funzione dello schema', () => {
    expect(gapsOn({ [BARREL]: 'export function somethingElse() {}' })).toEqual([
      { path: BARREL, message: 'no `homepageCollectionSchema` function — was it renamed?' },
    ])
  })

  it("segnala l'unione che non è più un letterale di array", () => {
    const src = "export function homepageCollectionSchema() { return z.discriminatedUnion('section', members) }"

    expect(gapsOn({ [BARREL]: src })).toEqual([
      { path: BARREL, message: 'the second argument of z.discriminatedUnion is not an array literal' },
    ])
  })

  it('segnala il barrel che destruttura il contesto, che una sezione con immagine non potrebbe ricevere', () => {
    const src = "export function homepageCollectionSchema({ image }) { return z.discriminatedUnion('section', []) }"

    expect(gapsOn({ [BARREL]: src })).toEqual([
      { path: BARREL, message: expect.stringContaining('destructures its parameter') },
    ])
  })

  it('segnala lo strato dati che ha perso il suo return', () => {
    const src = 'export function getHomepageSections() { return buildSections() }'

    expect(gapsOn({ [DATA]: src })).toEqual([{ path: DATA, message: expect.stringContaining('no top-level `return') }])
  })
})

describe('i marcatori della pagina a sezioni', () => {
  it('segnala il marcatore delle sezioni sparito dalle pagine', () => {
    expect(gapsOn({ [PAGE]: '---\n// @gen:homepage-imports\n---\n' })).toEqual([
      { path: 'src/pages/', message: expect.stringContaining('no page carries') },
    ])
  })

  it('segnala il marcatore degli import sparito dalla pagina che porta le sezioni', () => {
    expect(gapsOn({ [PAGE]: '---\n---\n{/* @gen:homepage-sections */}\n' })).toEqual([
      { path: PAGE, message: expect.stringContaining('@gen:homepage-imports') },
    ])
  })

  it('segnala il marcatore finito su più di una pagina', () => {
    const other = '---\n// @gen:homepage-imports\n---\n{/* @gen:homepage-sections */}\n'

    expect(gapsOn({ 'src/pages/other.astro': other })).toEqual([
      { path: 'src/pages/', message: expect.stringContaining('all carry the') },
    ])
  })
})

describe('quali collection doctor va a guardare', () => {
  it('segnala una collection registrata in content.config.ts a cui manca il barrel', () => {
    const config = [
      "import { aboutCollectionSchema } from '@/lib/schemas/about'",
      'export const collections = {}',
    ].join('\n')

    expect(gapsOn({ [CONFIG]: config })).toEqual([
      { path: 'src/lib/schemas/about/index.ts', message: expect.stringContaining('has no schema barrel') },
    ])
  })

  it('non guarda le collection piatte, che non hanno sezioni da agganciare', () => {
    const config = ["import { servicesSchema } from '@/lib/schemas/services'", 'export const collections = {}'].join(
      '\n',
    )

    expect(gapsOn({ [CONFIG]: config })).toEqual([])
  })

  it('senza content.config.ts non dice niente: è già un requisito del contratto', () => {
    expect(gapsOn({ [CONFIG]: null })).toEqual([])
  })

  it('riporta il file che non si lascia leggere invece di interrompere il referto', () => {
    const root = makeRoot()
    rmSync(join(root, 'src/pages'), { recursive: true })

    expect(anchorGaps(root)).toEqual([{ path: CONFIG, message: expect.stringContaining('non si lascia leggere') }])
  })
})

describe('i dizionari del progetto', () => {
  it('segnala il dizionario che ha perso il suo as const', () => {
    expect(gapsOn({ [IT]: 'export const it = {}\n' })).toEqual([
      { path: IT, message: expect.stringContaining('not an object literal') },
    ])
  })

  it('segnala la cartella dei dizionari rimasta senza dizionari', () => {
    expect(gapsOn({ [IT]: null })).toEqual([
      { path: 'src/i18n/strings', message: 'no dictionary to register the page strings in' },
    ])
  })

  it('senza la cartella dei dizionari non dice niente: è già un requisito del contratto', () => {
    const root = makeRoot()
    rmSync(join(root, 'src/i18n'), { recursive: true })

    expect(anchorGaps(root)).toEqual([])
  })
})
