import { afterEach, describe, expect, it } from 'vitest'
import { injectSection } from './inject-section.mjs'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

const BARREL = 'src/lib/schemas/homepage/index.ts'
const DATA = 'src/lib/homepage.ts'
const PAGE = 'src/pages/index.astro'

const HOMEPAGE = { camel: 'homepage', kebab: 'homepage', pascal: 'Homepage' }
const FEATURES = { collection: HOMEPAGE, camel: 'features', kebab: 'features', pascal: 'Features' }
const GALLERY = { collection: HOMEPAGE, camel: 'gallery', kebab: 'gallery', pascal: 'Gallery' }

const BARREL_WITHOUT_CONTEXT = [
  "import { z } from 'astro/zod'",
  "import { heroSectionSchema } from './hero'",
  'export function homepageCollectionSchema() {',
  "  return z.discriminatedUnion('section', [heroSectionSchema()])",
  '}',
].join('\n')

const ABOUT_PAGE = 'src/pages/company/about.astro'
const ABOUT = {
  'src/lib/schemas/about/index.ts': [
    "import { z } from 'astro/zod'",
    "import { introSectionSchema } from './intro'",
    'export function aboutCollectionSchema() {',
    "  return z.discriminatedUnion('section', [introSectionSchema()])",
    '}',
  ].join('\n'),
  'src/lib/about.ts':
    "export async function getAboutSections() { const { pick } = await load(); return { intro: pick('intro') } }",
  [ABOUT_PAGE]:
    '---\n// @gen:about-imports\nconst content = await getAboutSections()\n---\n{/* @gen:about-sections */}\n',
}

const inject = (root: string) => injectSection({ root, ...FEATURES })

afterEach(cleanupRoots)

describe('injectSection', () => {
  it('registers the schema in the barrel', () => {
    const root = makeRoot()

    inject(root)

    expect(read(root, BARREL)).toMatch(/import \{ featuresSectionSchema \} from ["']\.\/features["']/)
    expect(read(root, BARREL)).toContain('featuresSectionSchema()')
  })

  it('registers the pick in getHomepageSections', () => {
    const root = makeRoot()

    inject(root)

    expect(read(root, DATA)).toContain("features: pick('features')")
  })

  it('imports the component and renders it in index.astro', () => {
    const root = makeRoot()

    inject(root)

    expect(read(root, PAGE)).toContain("import Features from '@/components/homepage/features.astro'")
    expect(read(root, PAGE)).toContain('<Features {...content.features} />')
  })
})

describe('una seconda collection a sezioni', () => {
  it('scrive nel barrel, nello strato dati e nella pagina della collection scelta, e non nella homepage', () => {
    const root = makeRoot(ABOUT)
    const collection = { camel: 'about', kebab: 'about', pascal: 'About' }

    injectSection({ root, collection, camel: 'team', kebab: 'team', pascal: 'Team' })

    expect(read(root, 'src/lib/schemas/about/index.ts')).toContain('teamSectionSchema()')
    expect(read(root, 'src/lib/about.ts')).toContain("team: pick('team')")
    expect(read(root, ABOUT_PAGE)).toContain("import Team from '@/components/about/team.astro'")
    expect(read(root, ABOUT_PAGE)).toContain('<Team {...content.team} />')
    expect(read(root, PAGE)).not.toContain('Team')
  })
})

describe("una sezione con l'immagine", () => {
  it('riceve il contesto che la funzione del barrel già dichiara', () => {
    const root = makeRoot()

    injectSection({ root, ...GALLERY, image: true })

    expect(read(root, BARREL)).toContain('gallerySectionSchema(context)')
  })

  it('aggiunge al barrel il parametro e il suo tipo quando mancano, una volta sola', () => {
    const root = makeRoot({ [BARREL]: BARREL_WITHOUT_CONTEXT })

    injectSection({ root, ...GALLERY, image: true })
    injectSection({ root, ...FEATURES, image: true })

    const barrel = read(root, BARREL)
    expect(barrel.match(/context: SchemaContext/g)).toHaveLength(1)
    expect(barrel.match(/import type \{ SchemaContext \} from ["']astro:content["']/g)).toHaveLength(1)
    expect(barrel).toContain('featuresSectionSchema(context)')
  })

  it('non importa di nuovo il tipo che il barrel importa già', () => {
    const root = makeRoot({ [BARREL]: `import type { SchemaContext } from 'astro:content'\n${BARREL_WITHOUT_CONTEXT}` })

    injectSection({ root, ...GALLERY, image: true })

    expect(read(root, BARREL).match(/\{ SchemaContext \}/g)).toHaveLength(1)
  })
})

describe('insertion position relative to the markers', () => {
  it.each([
    ["import Features from '@/components/homepage/features.astro'", '// @gen:homepage-imports'],
    ['<Features {...content.features} />', '{/* @gen:homepage-sections */}'],
  ])('puts %s above its marker', (inserted, marker) => {
    const root = makeRoot()

    inject(root)

    const src = read(root, PAGE)
    expect(src.indexOf(inserted)).toBeGreaterThan(-1)
    expect(src.indexOf(inserted)).toBeLessThan(src.indexOf(marker))
  })

  it('keeps the markers, so the page stays injectable a second time', () => {
    const root = makeRoot()

    inject(root)

    expect(read(root, PAGE)).toContain('// @gen:homepage-imports')
    expect(read(root, PAGE)).toContain('{/* @gen:homepage-sections */}')
  })
})

describe('re-running against its own output', () => {
  it.each([
    ['the schema import', BARREL, /import \{ featuresSectionSchema \}/g],
    ['the union member', BARREL, /featuresSectionSchema\(\)/g],
    ['the pick', DATA, /features: pick\('features'\)/g],
    ['the component import', PAGE, /import Features from/g],
    ['the component usage', PAGE, /<Features \{\.\.\.content\.features\} \/>/g],
  ])('does not duplicate %s', (_what, file, pattern) => {
    const root = makeRoot()

    inject(root)
    inject(root)

    expect(read(root, file).match(pattern)).toHaveLength(1)
  })
})
