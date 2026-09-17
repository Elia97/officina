import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import collectionGenerator from './collection.mjs'
import pageGenerator from './page.mjs'
import sectionGenerator from './section.mjs'
import {
  actionsFor,
  addActions,
  functionSteps,
  promptNamed,
  registerWith,
  runAction,
} from './test-helpers/fake-plop.ts'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

// I generatori catturano `process.cwd()` alla registrazione, quindi il chdir deve precederla.
let original: string

beforeEach(() => {
  original = process.cwd()
  process.chdir(makeRoot())
})

afterEach(() => {
  process.chdir(original)
  cleanupRoots()
})

describe('gen:collection wiring', () => {
  it('runs the content.config.ts pre-flight before any file is written', () => {
    const { plop, config } = registerWith(collectionGenerator, 'collection')
    const { preflight } = functionSteps(actionsFor(config, { name: 'services', document: false }))

    expect(runAction(preflight, { name: 'services' }, plop)).toMatch(/contract checks passed/)
  })

  it('injects only after the schema and the example entry exist', () => {
    const { plop, config } = registerWith(collectionGenerator, 'collection')
    const { inject } = functionSteps(actionsFor(config, { name: 'services', document: false }))

    expect(runAction(inject, { name: 'services', document: false }, plop)).toMatch(/injected collection/)
    expect(read(process.cwd(), 'src/content.config.ts')).toContain('const services = defineCollection({')
  })

  it.each([
    [true, 'src/content/{{dashCase name}}/example.md', 'doc.md.hbs'],
    [false, 'src/content/{{dashCase name}}/example.yml', 'data.yml.hbs'],
  ])('picks the content file for document=%s', (document, path, template) => {
    const { config } = registerWith(collectionGenerator, 'collection')

    const [, entry] = addActions(actionsFor(config, { name: 'services', document }))

    expect(entry?.path).toBe(path)
    expect(entry?.templateFile).toContain(template)
  })

  it('rejects a name whose camel form would be an invalid const', () => {
    const { config } = registerWith(collectionGenerator, 'collection')

    expect(promptNamed(config, 'name').validate?.('2fa')).toMatch(/invalid identifier \(const 2fa\)/)
    expect(promptNamed(config, 'name').validate?.('...')).toBe('Collection name is required')
    expect(promptNamed(config, 'name').validate?.('services')).toBe(true)
  })
})

describe('gen:section wiring', () => {
  const answers = { collection: 'homepage', name: 'features' }

  it('runs the hook-point pre-flight before any file is written', () => {
    const { plop, config } = registerWith(sectionGenerator, 'section')
    const { preflight } = functionSteps(actionsFor(config, answers))

    expect(runAction(preflight, answers, plop)).toMatch(/contract checks passed/)
  })

  it('injects the union entry, the pick and the component, reporting the pascal name', () => {
    const { plop, config } = registerWith(sectionGenerator, 'section')
    const { inject } = functionSteps(actionsFor(config, answers))

    expect(runAction(inject, answers, plop)).toContain('Features')
    expect(read(process.cwd(), 'src/lib/homepage.ts')).toContain("features: pick('features')")
  })

  it('scrive schema, contenuto e componente nelle cartelle della collection scelta', () => {
    const { config } = registerWith(sectionGenerator, 'section')

    const paths = addActions(actionsFor(config, { collection: 'about us', name: 'team members' })).map(
      ({ path }) => path,
    )

    expect(paths).toEqual([
      'src/lib/schemas/about-us/team-members.ts',
      'src/content/about-us/team-members.yml',
      'src/components/about-us/team-members.astro',
    ])
  })

  it("porta la risposta sull'immagine al pre-volo e all'iniezione", () => {
    const { plop, config } = registerWith(sectionGenerator, 'section')
    const withImage = { collection: 'homepage', name: 'gallery', image: true }
    const { preflight, inject } = functionSteps(actionsFor(config, withImage))

    expect(runAction(preflight, withImage, plop)).toMatch(/contract checks passed/)
    runAction(inject, withImage, plop)
    expect(read(process.cwd(), 'src/lib/schemas/homepage/index.ts')).toContain('gallerySectionSchema(context)')
  })
})

describe('gen:section template data', () => {
  it("passa il nome della sezione come section, che fra le risposte non c'è: node-plop fa vincere le risposte su data", () => {
    const { config } = registerWith(sectionGenerator, 'section')
    const answers = { collection: 'homepage', name: 'features', image: false }

    for (const action of addActions(actionsFor(config, answers))) {
      expect(action.data).toEqual({ section: 'features' })
      expect(Object.keys(action.data ?? {}).filter((key) => key in answers)).toEqual([])
    }
  })
})

describe('gen:section prompts', () => {
  it('rejects a name whose camel form would be an invalid schema identifier', () => {
    const { config } = registerWith(sectionGenerator, 'section')

    expect(promptNamed(config, 'name').validate?.('2fa')).toMatch(/invalid identifier \(2faSectionSchema\)/)
    expect(promptNamed(config, 'name').validate?.('...')).toBe('Section name is required')
    expect(promptNamed(config, 'name').validate?.('features')).toBe(true)
  })

  it('chiede la collection, con la homepage di default, e rifiuta un nome che non diventa identificatore', () => {
    const { config } = registerWith(sectionGenerator, 'section')
    const prompt = promptNamed(config, 'collection')

    expect(prompt.default).toBe('homepage')
    expect(prompt.validate?.('2fa')).toMatch(/invalid identifier \(2faCollectionSchema\)/)
    expect(prompt.validate?.('...')).toBe('Collection name is required')
    expect(prompt.validate?.('about')).toBe(true)
  })

  it("chiede se la sezione porta un'immagine, e di default no", () => {
    const { config } = registerWith(sectionGenerator, 'section')

    expect(promptNamed(config, 'image')).toMatchObject({ type: 'confirm', default: false })
  })
})

describe('gen:page wiring', () => {
  it('controlla percorso e dizionari prima di scrivere, poi inietta titolo e descrizione', () => {
    const { plop, config } = registerWith(pageGenerator, 'page')
    const answers = { name: 'about-us', dynamic: false }
    const { preflight, inject } = functionSteps(actionsFor(config, answers))

    expect(runAction(preflight, answers, plop)).toMatch(/contract checks passed/)
    expect(runAction(inject, answers, plop)).toBe('injected page.aboutUs.title, page.aboutUs.description')
    expect(read(process.cwd(), 'src/i18n/strings/it.ts')).toContain("'page.aboutUs.description': '<PAGE_DESCRIPTION>'")
  })

  it('a una pagina dinamica inietta solo il titolo', () => {
    const { plop, config } = registerWith(pageGenerator, 'page')
    const answers = { name: 'blog', dynamic: true }
    const { inject } = functionSteps(actionsFor(config, answers))

    expect(runAction(inject, answers, plop)).toBe('injected page.blog.title')
  })

  it('si ferma prima di scrivere se la pagina esiste già', () => {
    process.chdir(makeRoot({ 'src/pages/about-us.astro': '---\n---\n' }))
    const { plop, config } = registerWith(pageGenerator, 'page')
    const answers = { name: 'about-us', dynamic: false }
    const { preflight } = functionSteps(actionsFor(config, answers))

    expect(() => runAction(preflight, answers, plop)).toThrow(/already exists/)
  })
})
