import { afterEach, describe, expect, it } from 'vitest'
import { findSectionedPages, sectionFiles, sectionTargets } from './section-targets.mjs'
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
