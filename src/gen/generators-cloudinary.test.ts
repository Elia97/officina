import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import collectionGenerator from './collection.mjs'
import sectionGenerator from './section.mjs'
import {
  type Answers,
  actionsFor,
  addActions,
  functionSteps,
  promptNamed,
  registerWith,
  runAction,
} from './test-helpers/fake-plop.ts'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

// plop non riesporta handlebars: i template li rende quello di node-plop, una sua dipendenza.
const fromPlop = createRequire(createRequire(import.meta.url).resolve('plop/package.json'))
const handlebars = createRequire(fromPlop.resolve('node-plop/package.json'))('handlebars')

const HELPERS = ['camelCase', 'dashCase', 'pascalCase'] as const

function generate(define: typeof sectionGenerator, name: string, answers: Answers): Record<string, string> {
  const { plop, config } = registerWith(define, name)
  const engine = handlebars.create()
  for (const helper of HELPERS) engine.registerHelper(helper, plop.getHelper(helper))
  return Object.fromEntries(
    addActions(actionsFor(config, answers)).map(({ path, templateFile, data }) => {
      const source = readFileSync(new URL(templateFile, import.meta.url), 'utf8')
      return [path, engine.compile(source)({ ...data, ...answers }) as string]
    }),
  )
}

const gallery = { collection: 'homepage', name: 'gallery', image: true }
const about = { name: 'about', sections: true, page: 'about-us', section: 'intro', image: true }

let original: string

beforeEach(() => {
  original = process.cwd()
  process.chdir(makeRoot())
})

afterEach(() => {
  process.chdir(original)
  cleanupRoots()
  vi.unstubAllEnvs()
})

describe("gen:section con `images: 'cloudinary'`", () => {
  beforeEach(() => {
    vi.stubEnv('OFFICINA_IMAGES', 'cloudinary')
  })

  it('scrive photoSchema, il public_id segnaposto e il componente che prende la foto da Cloudinary', () => {
    const files = generate(sectionGenerator, 'section', gallery)
    const schema = files['src/lib/schemas/homepage/gallery.ts']
    const component = files['src/components/homepage/gallery.astro']

    expect(schema).toContain("import { ctaSchema, photoSchema } from '../common'")
    expect(schema).toContain('export function gallerySectionSchema() {')
    expect(schema).toContain('    image: photoSchema,')
    expect(schema).not.toContain('SchemaContext')
    expect(files['src/content/homepage/gallery.yml']).toContain("image:\n  public_id: '<PUBLIC_ID>'\n  alt: ")
    expect(component).toContain("import Photo from '@/components/ui/photo.astro'")
    expect(component).toContain('<Photo\n      publicId={image.public_id}\n      alt={image.alt}')
    expect(component).not.toContain('astro:assets')
  })

  it('inietta la sezione senza passarle il contesto, che serve solo a imageSchema', () => {
    const { plop, config } = registerWith(sectionGenerator, 'section')
    const { inject } = functionSteps(actionsFor(config, gallery))

    runAction(inject, gallery, plop)

    expect(read(process.cwd(), 'src/lib/schemas/homepage/index.ts')).toContain('gallerySectionSchema()')
  })

  it('dice nella domanda dove nasce il contenuto della foto', () => {
    const { config } = registerWith(sectionGenerator, 'section')

    expect(promptNamed(config, 'image').message).toContain("public_id '<PUBLIC_ID>'")
  })

  it('una sezione senza foto non porta né photoSchema né il componente', () => {
    const files = generate(sectionGenerator, 'section', { ...gallery, image: false })

    expect(files['src/lib/schemas/homepage/gallery.ts']).not.toContain('photoSchema')
    expect(files['src/components/homepage/gallery.astro']).not.toContain('Photo')
  })
})

describe('gen:section con le foto locali', () => {
  it('scrive quello che ha sempre scritto: imageSchema, placeholder.jpg e <Image>', () => {
    const files = generate(sectionGenerator, 'section', gallery)

    expect(files['src/lib/schemas/homepage/gallery.ts']).toContain(
      'export function gallerySectionSchema({ image }: SchemaContext) {',
    )
    expect(files['src/content/homepage/gallery.yml']).toContain('src: ../../assets/placeholder.jpg')
    expect(files['src/components/homepage/gallery.astro']).toContain("import { Image } from 'astro:assets'")
    expect(files['src/components/homepage/gallery.astro']).not.toContain('Photo')
  })

  it('dice nella domanda che il contenuto nasce su placeholder.jpg', () => {
    const { config } = registerWith(sectionGenerator, 'section')

    expect(promptNamed(config, 'image').message).toContain('src/assets/placeholder.jpg')
  })
})

describe('gen:collection a sezioni, con la prima sezione che ha una foto', () => {
  it('con Cloudinary il barrel non riceve il contesto, e la sezione prende photoSchema', () => {
    vi.stubEnv('OFFICINA_IMAGES', 'cloudinary')
    const files = generate(collectionGenerator, 'collection', about)

    expect(files['src/lib/schemas/about/index.ts']).toContain('export function aboutCollectionSchema() {')
    expect(files['src/lib/schemas/about/index.ts']).not.toContain('SchemaContext')
    expect(files['src/lib/schemas/about/intro.ts']).toContain('image: photoSchema,')
  })

  it('con le foto locali il barrel passa il contesto alla sezione', () => {
    const files = generate(collectionGenerator, 'collection', about)

    expect(files['src/lib/schemas/about/index.ts']).toContain('introSectionSchema(context)')
    expect(files['src/lib/schemas/about/intro.ts']).toContain('image: imageSchema(image),')
  })
})
