import { describe, expect, it } from 'vitest'

import { useFixtureProject } from '../test-fixture.ts'
import {
  auditRoutes,
  ERROR_PAGES,
  expectedRoutes,
  missingRouteFailures,
  NON_HTML_ROUTES,
  orphanExceptions,
  readPageFiles,
  routeOf,
  smokeRoutes,
} from './routes.ts'

const PAGES_DIR = 'src/pages'
const prerendered = '// no annotation: prerendered by default\n'
const optedOut = 'export const prerender = false\n'

const template = () => expectedRoutes(readPageFiles(PAGES_DIR), PAGES_DIR)

useFixtureProject()

describe('routeOf', () => {
  it('maps emitted HTML back to its route', () => {
    expect(routeOf('dist/client/index.html', 'dist/client')).toBe('/')
    expect(routeOf('dist/client/contatti/index.html', 'dist/client')).toBe('/contatti')
    expect(routeOf('dist/client/404.html', 'dist/client')).toBe('/404')
  })
})

describe('expectedRoutes', () => {
  it('splits pages by prerender, keeping dynamic segments as patterns', () => {
    const expected = expectedRoutes(
      [
        { file: 'src/pages/index.astro', source: prerendered },
        { file: 'src/pages/blog/[slug].astro', source: prerendered },
        { file: 'src/pages/live.astro', source: optedOut },
      ],
      PAGES_DIR,
    )
    expect(expected.exact).toEqual([{ route: '/', file: 'src/pages/index.astro' }])
    expect(expected.ssr).toEqual(['src/pages/live.astro'])
    expect(expected.patterns[0]?.pattern.test('/blog/anything')).toBe(true)
    expect(expected.patterns[0]?.pattern.test('/blog/a/b')).toBe(false)
  })

  it('ignores the word prerender inside prose', () => {
    const source = '// this page is intentionally not prerender = false\n'
    const expected = expectedRoutes([{ file: 'src/pages/x.astro', source }], PAGES_DIR)
    expect(expected.ssr).toEqual([])
    expect(expected.exact).toEqual([{ route: '/x', file: 'src/pages/x.astro' }])
  })

  it('treats a rest segment as matching any depth', () => {
    const expected = expectedRoutes([{ file: 'src/pages/[...path].astro', source: prerendered }], PAGES_DIR)
    expect(expected.patterns[0]?.pattern.test('/a/b/c')).toBe(true)
  })

  it('matches a paginated route that emitted page one alone', () => {
    const expected = expectedRoutes([{ file: 'src/pages/news/[...page].astro', source: prerendered }], PAGES_DIR)

    expect(expected.patterns[0]?.pattern.test('/news')).toBe(true)
    expect(expected.patterns[0]?.pattern.test('/news/2')).toBe(true)
    expect(expected.patterns[0]?.pattern.test('/newsletter')).toBe(false)
  })
})

describe('missingRouteFailures', () => {
  const expected = expectedRoutes(
    [
      { file: 'src/pages/index.astro', source: '' },
      { file: 'src/pages/blog/[slug].astro', source: '' },
    ],
    PAGES_DIR,
  )

  it('passes when every expected route was emitted', () => {
    expect(missingRouteFailures(expected, ['/', '/blog/hello'], 'dist/client')).toEqual([])
  })

  it('reports a prerendered page that emitted nothing', () => {
    expect(missingRouteFailures(expected, ['/'], 'dist/client')).toEqual([
      expect.stringContaining('rotta mancante /blog/[slug]'),
    ])
  })

  // [HARD] Fail-open: ogni altra asserzione itera sulle pagine emesse.
  it('refuses to pass on an empty dist', () => {
    expect(missingRouteFailures(expected, [], 'dist/client')).toEqual([expect.stringContaining('nessun .html')])
  })
})

describe('readPageFiles', () => {
  it('reads the real pages of this template, and only the .astro ones', () => {
    const files = readPageFiles(PAGES_DIR).map(({ file }) => file)

    expect(files).toContain('src/pages/index.astro')
    expect(files.every((file) => file.endsWith('.astro'))).toBe(true)
  })

  it('finds the endpoints outside the expected routes: they prerender but emit no HTML', () => {
    expect(template().exact.map(({ route }) => route)).not.toContain('/robots.txt')
  })
})

describe('auditRoutes', () => {
  it('drops the error pages, which answer with their own status', () => {
    expect(auditRoutes(template())).not.toContain('/404')
    expect(auditRoutes(template())).toContain('/contatti')
  })

  it('sorts, so the list does not depend on the order the filesystem hands back', () => {
    const routes = auditRoutes(template())

    expect(routes[0]).toBe('/')
    expect(routes).toEqual([...routes].sort())
  })

  it('takes in a page nobody declared anywhere: adding one updates every consumer at once', () => {
    const pages = [...readPageFiles(PAGES_DIR), { file: 'src/pages/services.astro', source: prerendered }]

    expect(auditRoutes(expectedRoutes(pages, PAGES_DIR))).toContain('/services')
  })

  it('leaves out a page that opted out of prerendering', () => {
    const pages = [...readPageFiles(PAGES_DIR), { file: 'src/pages/live.astro', source: optedOut }]

    expect(auditRoutes(expectedRoutes(pages, PAGES_DIR))).not.toContain('/live')
  })
})

describe('smokeRoutes', () => {
  it('asks for HTML on the pages and for the declared type on the endpoints', () => {
    const routes = smokeRoutes(template())

    expect(routes).toContainEqual({ path: '/', type: 'text/html' })
    expect(routes).toContainEqual({ path: '/api/health', type: 'application/json' })
  })

  it('carries a second HTML page, which is what the trailing-slash probe needs', () => {
    expect(smokeRoutes(template()).filter(({ type }) => type === 'text/html').length).toBeGreaterThan(1)
  })
})

describe('orphanExceptions', () => {
  it('finds none in this template: every declared exception is a real page', () => {
    expect(orphanExceptions(template())).toEqual([])
  })

  it('names the exception left behind when its page is renamed', () => {
    const pages = readPageFiles(PAGES_DIR).filter(({ file }) => !file.endsWith('404.astro'))

    expect(orphanExceptions(expectedRoutes(pages, PAGES_DIR))).toEqual(['/404'])
  })
})

describe('the hand-written additions', () => {
  it('never overlap the derived routes', () => {
    const derived = new Set(template().exact.map(({ route }) => route))

    expect(NON_HTML_ROUTES.filter(({ path }) => derived.has(path))).toEqual([])
  })

  it('never overlap the declared exceptions', () => {
    expect(NON_HTML_ROUTES.filter(({ path }) => ERROR_PAGES.includes(path))).toEqual([])
  })
})
