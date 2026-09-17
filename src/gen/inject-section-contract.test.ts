import { afterEach, describe, expect, it } from 'vitest'
import { assertSectionInjectable } from './inject-section.mjs'
import { cleanupRoots, makeRoot } from './test-helpers/gen-fixture.ts'

const BARREL = 'src/lib/schemas/homepage/index.ts'
const DATA = 'src/lib/homepage.ts'
const PAGE = 'src/pages/index.astro'

const HOMEPAGE = { camel: 'homepage', kebab: 'homepage', pascal: 'Homepage' }
const ABOUT = { camel: 'about', kebab: 'about', pascal: 'About' }

const page = (frontmatter = '') =>
  `---\n${frontmatter}\n// @gen:homepage-imports\n---\n{/* @gen:homepage-sections */}\n`

const assertOn =
  (overrides: Record<string, string | null> = {}, name = 'features', collection = HOMEPAGE) =>
  () =>
    assertSectionInjectable({
      root: makeRoot(overrides),
      collection,
      camel: name,
      kebab: name,
      pascal: `${name[0]?.toUpperCase()}${name.slice(1)}`,
    })

afterEach(cleanupRoots)

describe('hook points in the schema barrel', () => {
  it('accepts the real repo, which is what the contract actually describes', () => {
    expect(assertOn()).not.toThrow()
  })

  it('refuses when homepageCollectionSchema was renamed', () => {
    expect(assertOn({ [BARREL]: 'export function somethingElse() {}' })).toThrow(/was it renamed/)
  })

  it('refuses when the discriminated union is gone', () => {
    expect(assertOn({ [BARREL]: 'export function homepageCollectionSchema() { return z.object({}) }' })).toThrow(
      /no `z.discriminatedUnion/,
    )
  })

  it('refuses when the union members are not an array literal', () => {
    const src = "export function homepageCollectionSchema() { return z.discriminatedUnion('section', members) }"
    expect(assertOn({ [BARREL]: src })).toThrow(/not an array literal/)
  })
})

describe('la collection scelta', () => {
  it('rifiuta una collection senza barrel, che nasce da gen:collection', () => {
    expect(assertOn({}, 'team', ABOUT)).toThrow(/"about" collection has no schema barrel/)
  })

  it('rifiuta una collection con il barrel ma senza strato dati', () => {
    const barrel = "export function aboutCollectionSchema() { return z.discriminatedUnion('section', []) }"
    expect(assertOn({ 'src/lib/schemas/about/index.ts': barrel }, 'team', ABOUT)).toThrow(/has no data layer/)
  })

  it('rifiuta quando più pagine portano il marcatore delle sezioni', () => {
    expect(assertOn({ 'src/pages/other.astro': page() })).toThrow(/all carry the/)
  })
})

describe('il contesto che una sezione con immagine riceve', () => {
  it('accetta il barrel vero, che dà un nome al contesto', () => {
    expect(assertOn({}, 'gallery')).not.toThrow()
  })

  it('accetta un barrel senza parametro, che il generatore completa', () => {
    const src = "export function homepageCollectionSchema() { return z.discriminatedUnion('section', []) }"
    expect(assertOn({ [BARREL]: src }, 'gallery')).not.toThrow()
  })

  it('rifiuta un barrel che destruttura il contesto, anche per una sezione senza immagine', () => {
    const src = "export function homepageCollectionSchema({ image }) { return z.discriminatedUnion('section', []) }"
    expect(assertOn({ [BARREL]: src })).toThrow(/destructures its parameter/)
  })
})

describe('hook points in the data layer', () => {
  it('refuses when getHomepageSections was renamed', () => {
    expect(assertOn({ [DATA]: 'export function other() {}' })).toThrow(/was it renamed/)
  })

  it('refuses when there is no top-level return object to register the pick in', () => {
    const src = 'export function getHomepageSections() { return buildSections() }'
    expect(assertOn({ [DATA]: src })).toThrow(/no top-level `return/)
  })
})

describe('markers in the page', () => {
  it('refuses without the imports marker, since the import has no anchor', () => {
    expect(assertOn({ [PAGE]: '---\n---\n{/* @gen:homepage-sections */}\n' })).toThrow(/@gen:homepage-imports/)
  })

  it('refuses without the sections marker, since the component has no anchor', () => {
    expect(assertOn({ [PAGE]: '---\n// @gen:homepage-imports\n---\n' })).toThrow(/@gen:homepage-sections/)
  })
})

describe('collisions', () => {
  it('refuses a section already in the union', () => {
    expect(assertOn({}, 'hero')).toThrow(/already in the union/)
  })

  it("riconosce una sezione già nell'unione qualunque argomento riceva", () => {
    const src =
      "export function homepageCollectionSchema(context) { return z.discriminatedUnion('section', [featuresSectionSchema(context)]) }"
    expect(assertOn({ [BARREL]: src })).toThrow(/already in the union/)
  })

  it('refuses when the schema identifier is already bound in the barrel', () => {
    const src = [
      "import { featuresSectionSchema } from './elsewhere'",
      'export function homepageCollectionSchema() {',
      "  return z.discriminatedUnion('section', [])",
      '}',
    ].join('\n')
    expect(assertOn({ [BARREL]: src })).toThrow(/would collide/)
  })

  it('refuses a section already picked in getHomepageSections', () => {
    const barrel = "export function homepageCollectionSchema() { return z.discriminatedUnion('section', []) }"
    expect(assertOn({ [BARREL]: barrel }, 'hero')).toThrow(/already picked/)
  })

  it('refuses when the component name is already bound in the frontmatter', () => {
    expect(assertOn({ [PAGE]: page("import Features from '@/components/other.astro'") })).toThrow(/would collide/)
  })

  it('treats a page with markers but no frontmatter as having no bindings', () => {
    expect(assertOn({ [PAGE]: '// @gen:homepage-imports\n{/* @gen:homepage-sections */}\n' })).not.toThrow()
  })

  it.each([
    'src/lib/schemas/homepage/features.ts',
    'src/content/homepage/features.yml',
    'src/components/homepage/features.astro',
  ])('refuses when %s already exists', (target) => {
    expect(assertOn({ [target]: 'leftover from an aborted run' })).toThrow(/already exists/)
  })
})
