import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import collectionGenerator from './collection.mjs'
import {
  actionsFor,
  addActions,
  functionSteps,
  promptNamed,
  registerWith,
  runAction,
} from './test-helpers/fake-plop.ts'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

let original: string

beforeEach(() => {
  original = process.cwd()
  process.chdir(makeRoot())
})

afterEach(() => {
  process.chdir(original)
  cleanupRoots()
})

const answers = { name: 'about', sections: true, page: 'company/about-us', section: 'intro' }

describe('gen:collection, pagina a sezioni: le domande', () => {
  it('chiede documento solo alle collection piatte, e pagina e prima sezione solo a quelle a sezioni', () => {
    const { config } = registerWith(collectionGenerator, 'collection')

    expect(promptNamed(config, 'document').when?.({ sections: true })).toBe(false)
    expect(promptNamed(config, 'document').when?.({ sections: false })).toBe(true)
    for (const name of ['page', 'section', 'image']) {
      expect(promptNamed(config, name).when?.({ sections: true })).toBe(true)
      expect(promptNamed(config, name).when?.({ sections: false })).toBe(false)
    }
  })

  it('valida il percorso della pagina come gen:page', () => {
    const { config } = registerWith(collectionGenerator, 'collection')

    expect(promptNamed(config, 'page').validate?.('...')).toBe('Page path must contain at least one letter or digit')
    expect(promptNamed(config, 'page').validate?.('company/about-us')).toBe(true)
  })
})

describe('gen:collection, pagina a sezioni: i file', () => {
  it('scrive barrel, strato dati, pagina e prima sezione ai percorsi derivati dai nomi', () => {
    const { config } = registerWith(collectionGenerator, 'collection')

    const written = addActions(actionsFor(config, answers)).map(({ path, templateFile }) => [
      path,
      templateFile.split('/').slice(-2).join('/'),
    ])

    expect(written).toEqual([
      ['src/lib/schemas/about/index.ts', 'sections/index.ts.hbs'],
      ['src/lib/about.ts', 'sections/data-layer.ts.hbs'],
      ['src/pages/company/about-us.astro', 'sections/page.astro.hbs'],
      ['src/lib/schemas/about/intro.ts', 'section/schema.ts.hbs'],
      ['src/content/about/intro.yml', 'section/content.yml.hbs'],
      ['src/components/about/intro.astro', 'section/component.astro.hbs'],
    ])
  })

  it('passa in data solo quello che le risposte non danno, perché node-plop fa vincere le risposte su data', () => {
    const { config } = registerWith(collectionGenerator, 'collection')

    for (const action of addActions(actionsFor(config, answers))) {
      expect(action.data).toEqual({ collection: 'about', pageKey: 'companyAboutUs' })
      expect(Object.keys(action.data ?? {}).filter((key) => key in answers)).toEqual([])
    }
  })
})

describe('gen:collection, pagina a sezioni: pre-volo e iniezione', () => {
  it('verifica configurazione, pagina e dizionari, poi registra la collection e le chiavi della pagina', () => {
    const { plop, config } = registerWith(collectionGenerator, 'collection')
    const { preflight, inject } = functionSteps(actionsFor(config, answers))

    expect(runAction(preflight, answers, plop)).toMatch(/contract checks passed/)
    expect(runAction(inject, answers, plop)).toBe(
      'injected sectioned collection about and page.companyAboutUs.title, page.companyAboutUs.description',
    )
    expect(read(process.cwd(), 'src/content.config.ts')).toContain('schema: aboutCollectionSchema')
    expect(read(process.cwd(), 'src/i18n/strings/it.ts')).toContain("'page.companyAboutUs.title': 'About us'")
  })

  it.each([
    ['la pagina esiste già', { 'src/pages/company/about-us.astro': '---\n---\n' }, /already exists/],
    ['il barrel della collection esiste già', { 'src/lib/schemas/about/index.ts': '' }, /already exists/],
    [
      "un'altra pagina porta già i marcatori",
      { 'src/pages/team.astro': '{/* @gen:about-sections */}' },
      /already carries/,
    ],
  ])('si ferma prima di scrivere se %s', (_case, overrides, error) => {
    process.chdir(makeRoot(overrides))
    const { plop, config } = registerWith(collectionGenerator, 'collection')
    const { preflight } = functionSteps(actionsFor(config, answers))

    expect(() => runAction(preflight, answers, plop)).toThrow(error)
  })
})
