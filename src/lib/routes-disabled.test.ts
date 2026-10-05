import { describe, expect, it } from 'vitest'

import {
  auditRoutes,
  disabledRouteFailures,
  expectedRoutes,
  missingRepresentatives,
  missingRouteFailures,
  NON_HTML_ROUTES,
  smokeRoutes,
  unknownDisabled,
} from './routes.ts'

const PAGES_DIR = 'src/pages'
const page = (route: string, source = '') => ({ file: `${PAGES_DIR}${route}.astro`, source })

const PAGES = [
  page('/index'),
  page('/contatti'),
  page('/news/[...page]'),
  page('/news/[slug]'),
  page('/live/[id]', 'export const prerender = false\n'),
]
const expected = (disabled: readonly string[]) => expectedRoutes(PAGES, PAGES_DIR, disabled)
const labels = (routes: readonly { label: string }[]) => routes.map(({ label }) => label)
const html = (...routes: string[]) => ({ html: routes, ssr: [] })

const NEWS_OFF = expected(['/news/[...page]', '/news/[slug]'])
const REPRESENTATIVES = { '/news/[...page]': '/news/2', '/news/[slug]': '/news/ciao' }

describe('expectedRoutes con routes.disabled', () => {
  it('sposta fra le spente il pattern dichiarato, e lascia acceso l’altro', () => {
    const routes = expected(['/news/[slug]'])

    expect(labels(routes.disabled)).toEqual(['/news/[slug]'])
    expect(labels(routes.patterns)).toEqual(['/news/[...page]'])
  })

  it('non sposta una pagina statica né una SSR: getStaticPaths non decide niente per loro', () => {
    const routes = expected(['/contatti', '/live/[id]'])

    expect(routes.disabled).toEqual([])
    expect(routes.exact.map(({ route }) => route)).toContain('/contatti')
    expect(routes.ssr).toEqual(['src/pages/live/[id].astro'])
  })
})

describe('check bundle e una pagina spenta', () => {
  it('non pretende pagine da un pattern spento, e continua a pretenderle da uno acceso', () => {
    expect(missingRouteFailures(NEWS_OFF, html('/', '/contatti'), 'dist/client')).toEqual([])
    expect(missingRouteFailures(expected(['/news/[slug]']), html('/', '/contatti'), 'dist/client')).toEqual([
      expect.stringContaining('rotta mancante /news/[...page]'),
    ])
  })

  it('boccia una rotta emessa che solo un pattern spento spiega', () => {
    expect(disabledRouteFailures(NEWS_OFF, html('/', '/contatti', '/news/ciao'))).toEqual([
      'rotta spenta /news/[...page]: è in `routes.disabled`, ma la build ha emesso /news/ciao',
      'rotta spenta /news/[slug]: è in `routes.disabled`, ma la build ha emesso /news/ciao',
    ])
  })

  it('non accusa il pattern spento quando un pattern acceso spiega la stessa rotta', () => {
    expect(disabledRouteFailures(expected(['/news/[slug]']), html('/news', '/news/2'))).toEqual([])
  })

  it('non accusa il pattern spento quando la rotta è di una pagina statica', () => {
    const routes = expectedRoutes([page('/news'), page('/news/[...page]')], PAGES_DIR, ['/news/[...page]'])

    expect(disabledRouteFailures(routes, html('/news'))).toEqual([])
  })

  it('nomina le prime tre rotte in ordine e conta le altre', () => {
    const routes = expectedRoutes([page('/news/[slug]')], PAGES_DIR, ['/news/[slug]'])
    const emitted = html('/news/e', '/news/d', '/news/c', '/news/b', '/news/a')

    expect(disabledRouteFailures(routes, emitted)).toEqual([
      'rotta spenta /news/[slug]: è in `routes.disabled`, ma la build ha emesso /news/a, /news/b, /news/c e altre 2',
    ])
  })
})

describe('doctor, smoke e Lighthouse e una pagina spenta', () => {
  it('doctor non chiede il rappresentante di un pattern spento', () => {
    expect(missingRepresentatives(expected(['/news/[slug]']))).toEqual(['/news/[...page]'])
  })

  it("smoke e Lighthouse non visitano il rappresentante di un pattern spento, anche se c'è ancora", () => {
    const routes = expected(['/news/[slug]'])

    expect(auditRoutes(routes, REPRESENTATIVES)).toEqual(['/', '/contatti', '/news/2'])
    expect(smokeRoutes(routes, NON_HTML_ROUTES, REPRESENTATIVES)).not.toContainEqual({
      path: '/news/ciao',
      type: 'text/html',
    })
  })
})

describe('unknownDisabled', () => {
  it('nomina le voci che non spengono niente: un refuso, una pagina statica, una pagina SSR', () => {
    const disabled = ['/news/[slug]', '/news/[slgu]', '/contatti', '/live/[id]']

    expect(unknownDisabled(expected(disabled), disabled)).toEqual(['/news/[slgu]', '/contatti', '/live/[id]'])
  })

  it('senza voci non trova niente', () => {
    expect(unknownDisabled(expected([]))).toEqual([])
  })
})
