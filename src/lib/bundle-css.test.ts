import { describe, expect, it } from 'vitest'

import {
  inlineStyles,
  measureCss,
  type RouteStylesheets,
  rangeMediaQueries,
  rangeQueryFailures,
  routeCount,
} from './bundle-css.ts'

const MAIN = Math.round(15.5 * 1024)
const SHEETS = [
  { file: 'main.css', gzip: MAIN },
  { file: 'slug.css', gzip: 1024 },
  { file: 'lazy.css', gzip: 512 },
]

const measure = (routes: RouteStylesheets[], maxGzip = 16 * 1024) =>
  measureCss(routes, SHEETS, maxGzip, 'dist/client/_astro')

describe('measureCss', () => {
  it('raggruppa le rotte che collegano gli stessi fogli, e pesa da soli i fogli che nessuna collega', () => {
    const { groups, failures } = measure([
      { route: '/chi-siamo', stylesheets: ['main.css'] },
      { route: '/', stylesheets: ['main.css'] },
    ])

    expect(groups).toEqual([
      { stylesheets: ['main.css'], gzip: MAIN, routes: ['/chi-siamo', '/'] },
      { stylesheets: ['slug.css'], gzip: 1024, routes: [] },
      { stylesheets: ['lazy.css'], gzip: 512, routes: [] },
    ])
    expect(failures).toEqual([])
  })

  it('somma i fogli di una rotta, contando una volta quello ripetuto', () => {
    const { groups } = measure([{ route: '/blog/a', stylesheets: ['slug.css', 'main.css', 'slug.css'] }])

    expect(groups[0]).toEqual({ stylesheets: ['main.css', 'slug.css'], gzip: MAIN + 1024, routes: ['/blog/a'] })
  })

  it('oltre il tetto nomina la prima rotta, i fogli e quante rotte li collegano', () => {
    const { failures } = measure([
      { route: '/blog/b', stylesheets: ['main.css', 'slug.css'] },
      { route: '/blog/a', stylesheets: ['main.css', 'slug.css'] },
      { route: '/', stylesheets: ['main.css'] },
    ])

    expect(failures).toEqual(['/blog/a: CSS 16.5 KB > 16.0 KB (+0.5 KB) — main.css + slug.css, su 2 rotte'])
  })

  it('dice la rotta sola al singolare', () => {
    expect(measure([{ route: '/', stylesheets: ['main.css'] }], 15 * 1024).failures).toEqual([
      '/: CSS 15.5 KB > 15.0 KB (+0.5 KB) — main.css, su 1 rotta',
    ])
  })

  it("fallisce su un foglio citato che fra quelli della build non c'è, invece di misurare meno", () => {
    expect(measure([{ route: '/', stylesheets: ['ghost.css'] }]).failures).toEqual([
      '/: il foglio ghost.css non è in dist/client/_astro, e il CSS della rotta non si misura per intero',
    ])
  })

  it('fallisce su un foglio oltre il tetto che nessuna rotta misurata collega', () => {
    const { groups, failures } = measure(
      [
        { route: '/', stylesheets: ['slug.css'] },
        { route: '/api/health', stylesheets: [] },
      ],
      15 * 1024,
    )

    expect(groups.map(({ routes }) => routes)).toEqual([[], ['/'], []])
    expect(failures).toEqual([
      'main.css: CSS 15.5 KB > 15.0 KB (+0.5 KB), pesato da solo: nessuna rotta misurata lo collega',
    ])
  })
})

describe('routeCount', () => {
  it.each([
    [1, '1 rotta'],
    [3, '3 rotte'],
  ])('%i → %s', (count, label) => {
    expect(routeCount(count)).toBe(label)
  })
})

describe('rangeMediaQueries', () => {
  it.each(['(width>=40rem)', 'not all and (width>=96rem)', '(40rem<=width<=60rem)', '(width<40rem)'])(
    'trova %s',
    (query) => {
      expect(rangeMediaQueries(`@media ${query}{a{color:red}}`)).toEqual([query])
    },
  )

  it.each(['(min-width:40rem)', '(prefers-reduced-motion)', '(hover:hover)'])('lascia passare %s', (query) => {
    expect(rangeMediaQueries(`@media ${query}{a{color:red}}`)).toEqual([])
  })

  it('dice una volta la query ripetuta, e salta i commenti e le query di @container', () => {
    const css =
      '/* @media (width>=1px) */@media (width>=40rem){a{b:c}}@media (width>=40rem){d{e:f}}@container (width>=40rem){g{h:i}}'

    expect(rangeMediaQueries(css)).toEqual(['(width>=40rem)'])
  })
})

describe('inlineStyles', () => {
  it('raccoglie il CSS di ogni <style> della pagina, anche con attributi', () => {
    expect(inlineStyles('<style>a{b:c}</style><p>testo</p><style media="print">d{e:f}</style>')).toBe('a{b:c}\nd{e:f}')
  })
})

describe('rangeQueryFailures', () => {
  it('nomina il file e le sue query, e tace sui fogli che non ne hanno', () => {
    const failures = rangeQueryFailures([
      { file: 'dist/client/_astro/main.css', css: '@media (width>=40rem){a{b:c}}@media (width<64rem){d{e:f}}' },
      { file: 'dist/client/index.html', css: '@media (min-width:40rem){a{b:c}}' },
    ])

    expect(failures).toEqual([
      'dist/client/_astro/main.css: media query in sintassi di intervallo, che Safari legge solo dalla 16.4 — (width>=40rem), (width<64rem); si abbassano con `vite.build.cssTarget`',
    ])
  })
})
