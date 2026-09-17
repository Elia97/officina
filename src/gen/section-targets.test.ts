import { afterEach, describe, expect, it } from 'vitest'
import { findSectionedPages, sectionedCollections, sectionFiles, sectionTargets } from './section-targets.mjs'
import { cleanupRoots, makeRoot } from './test-helpers/gen-fixture.ts'

const HOMEPAGE = { camel: 'homepage', kebab: 'homepage', pascal: 'Homepage' }
const ABOUT_US = { camel: 'aboutUs', kebab: 'about-us', pascal: 'AboutUs' }
const ABOUT_US_MARKER = '{/* @gen:about-us-sections */}'

afterEach(cleanupRoots)

describe('sectionTargets', () => {
  it('per la homepage ricava i percorsi e i nomi che il template usa già', () => {
    expect(sectionTargets(HOMEPAGE)).toMatchObject({
      barrel: 'src/lib/schemas/homepage/index.ts',
      schemaFunction: 'homepageCollectionSchema',
      dataLayer: 'src/lib/homepage.ts',
      dataFunction: 'getHomepageSections',
      componentDir: 'src/components/homepage',
      importsMarker: '// @gen:homepage-imports',
      sectionsMarker: '{/* @gen:homepage-sections */}',
    })
  })

  it('usa il kebab per percorsi e marcatori, il camel e il pascal per le funzioni', () => {
    expect(sectionTargets(ABOUT_US)).toMatchObject({
      barrel: 'src/lib/schemas/about-us/index.ts',
      schemaFunction: 'aboutUsCollectionSchema',
      dataLayer: 'src/lib/about-us.ts',
      dataFunction: 'getAboutUsSections',
      contentDir: 'src/content/about-us',
      sectionsMarker: ABOUT_US_MARKER,
    })
  })

  it('mette schema, contenuto e componente di una sezione nelle cartelle della collection', () => {
    expect(sectionFiles(sectionTargets(ABOUT_US), 'team')).toEqual([
      'src/lib/schemas/about-us/team.ts',
      'src/content/about-us/team.yml',
      'src/components/about-us/team.astro',
    ])
  })
})

describe('findSectionedPages', () => {
  it('trova la homepage, che porta i suoi marcatori', () => {
    expect(findSectionedPages(makeRoot(), '{/* @gen:homepage-sections */}')).toEqual(['src/pages/index.astro'])
  })

  it('cerca in tutto src/pages e ignora i file che non sono pagine .astro', () => {
    const root = makeRoot({
      'src/pages/company/about-us.astro': ABOUT_US_MARKER,
      'src/pages/robots.txt.ts': `export const marker = '${ABOUT_US_MARKER}'`,
    })

    expect(findSectionedPages(root, ABOUT_US_MARKER)).toEqual(['src/pages/company/about-us.astro'])
  })

  it('le restituisce tutte, in ordine, quando più pagine portano lo stesso marcatore', () => {
    const root = makeRoot({ 'src/pages/team.astro': ABOUT_US_MARKER, 'src/pages/about.astro': ABOUT_US_MARKER })

    expect(findSectionedPages(root, ABOUT_US_MARKER)).toEqual(['src/pages/about.astro', 'src/pages/team.astro'])
  })
})

describe('sectionedCollections', () => {
  const config = (...lines: string[]) => ({
    'src/content.config.ts': [...lines, 'export const collections = {}'].join('\n'),
  })

  it('trova la homepage dal content.config.ts del progetto di prova', () => {
    expect(sectionedCollections(makeRoot())).toEqual([HOMEPAGE])
  })

  it('ricava kebab dal percorso e camel dal nome importato, e ne deriva il pascal', () => {
    const root = makeRoot(config("import { aboutUsCollectionSchema } from '@/lib/schemas/about-us'"))

    expect(sectionedCollections(root)).toEqual([ABOUT_US])
  })

  it('lascia fuori lo schema di una collection piatta, che non ha sezioni', () => {
    const root = makeRoot(config("import { servicesSchema } from '@/lib/schemas/services'"))

    expect(sectionedCollections(root)).toEqual([])
  })

  it('lascia fuori quello che non arriva da @/lib/schemas', () => {
    const root = makeRoot(config("import { blogCollectionSchema } from '@/content/blog'"))

    expect(sectionedCollections(root)).toEqual([])
  })

  it('lascia fuori un import che si chiama solo CollectionSchema, che non nomina nessuna collection', () => {
    const root = makeRoot(config("import { CollectionSchema } from '@/lib/schemas/homepage'"))

    expect(sectionedCollections(root)).toEqual([])
  })
})
