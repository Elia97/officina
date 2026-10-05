import { describe, expect, it } from 'vitest'

import { disabledRouteFailures, expectedRoutes, missingRouteFailures } from './routes.ts'

const PAGES_DIR = 'src/pages'
const ON_DEMAND = 'export const prerender = false\n'
const page = (route: string, source = '') => ({ file: `${PAGES_DIR}${route}.astro`, source })

describe('le rotte rese a richiesta si confrontano con le pagine per etichetta', () => {
  it('una pagina SSR accanto non fa passare per emesso un pattern che non ha emesso niente', () => {
    const expected = expectedRoutes([page('/index'), page('/news/[slug]'), page('/news/cerca', ON_DEMAND)], PAGES_DIR)

    expect(missingRouteFailures(expected, { html: ['/'], ssr: ['/news/cerca'] }, 'dist/client')).toEqual([
      expect.stringContaining('rotta mancante /news/[slug]'),
    ])
  })

  it("con `output: 'server'` il manifest porta il pattern stesso, e la pagina risulta servita", () => {
    const expected = expectedRoutes([page('/blog/[slug]')], PAGES_DIR)

    expect(missingRouteFailures(expected, { html: [], ssr: ['/blog/[slug]'] }, 'dist/client')).toEqual([])
  })

  it('boccia una pagina spenta che la build rende a richiesta: si spegne solo una pagina prerenderizzata', () => {
    const expected = expectedRoutes([page('/blog/[slug]')], PAGES_DIR, ['/blog/[slug]'])

    expect(disabledRouteFailures(expected, { html: [], ssr: ['/blog/[slug]'] })).toEqual([
      'rotta spenta /blog/[slug]: è in `routes.disabled`, ma la build la rende a richiesta, e si spegne solo una pagina prerenderizzata',
    ])
  })

  it('non accusa il pattern spento per una pagina SSR che gli sta accanto', () => {
    const pages = [page('/index'), page('/news/[...page]'), page('/news/cerca', ON_DEMAND)]
    const expected = expectedRoutes(pages, PAGES_DIR, ['/news/[...page]'])

    expect(disabledRouteFailures(expected, { html: ['/'], ssr: ['/news/cerca'] })).toEqual([])
  })
})
