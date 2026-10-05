import { describe, expect, it } from 'vitest'

import { brokenLines, htmlLinks, linkReport, linkTarget, servedBy, servedPaths, siteOrigin } from './links.ts'
import { routePattern } from './routes.ts'

const SITE = 'https://prova.test'
const at = (route: string) => new URL(route, SITE)

describe('htmlLinks', () => {
  it('legge href fra doppi apici, apici singoli, senza apici o senza valore, e solo sugli <a>', () => {
    const html = `<a href="/uno">1</a><a class="x" href='/due'>2</a><A HREF=/tre>3</A><a href>4</a>
      <a data-href="/no" title="vedi href=/no">no</a><a>senza</a><abbr title="x">y</abbr><link href="/foglio.css">`

    expect(htmlLinks(html)).toEqual(['/uno', '/due', '/tre', ''])
  })

  it('non si ferma a un > dentro un attributo fra apici', () => {
    const html = `<a class="px-4 has-[>svg]:px-3" href="#">a</a><a x-show="count > 0" href="/conta">b</a>`

    expect(htmlLinks(html)).toEqual(['#', '/conta'])
  })

  it('salta commenti, script, stili e il valore di un attributo, anche quando ci sono < e > grezzi', () => {
    const html = [
      '<!-- <a href="/news">News</a> -->',
      '<script>e.innerHTML = \'<a href="/da-script?ok=1">x</a>\'</script>',
      '<style>a[href="/no"] { color: red }</style>',
      '<div data-tip="vedi <a href=/no>qui</a>">suggerimento</div>',
      '<a href="/vero">vero</a>',
    ].join('\n')

    expect(htmlLinks(html)).toEqual(['/vero'])
  })

  it('decodifica le entità del valore', () => {
    expect(htmlLinks('<a href="/r&amp;d">1</a><a href="/&#99;&#x61;sa">2</a><a href="&QUOT;">3</a>')).toEqual([
      '/r&d',
      '/casa',
      '"',
    ])
  })
})

describe('siteOrigin', () => {
  it("prende l'origine di siteUrl, e senza un URL valido una che nessun link può avere", () => {
    expect(siteOrigin(`${SITE}/sotto`)).toBe(SITE)
    expect(siteOrigin(undefined)).toBe('https://officina.invalid')
    expect(siteOrigin('prova.test')).toBe('https://officina.invalid')
  })
})

describe('linkTarget', () => {
  it('riconosce segnaposto, ancore, altri schemi e link esterni', () => {
    expect(linkTarget('', at('/'))).toEqual({ kind: 'placeholder' })
    expect(linkTarget('  #  ', at('/'))).toEqual({ kind: 'placeholder' })
    expect(linkTarget('#contatti', at('/'))).toEqual({ kind: 'anchor' })
    for (const href of ['mailto:info@prova.test', 'tel:+390000', 'javascript:void(0)']) {
      expect(linkTarget(href, at('/'))).toEqual({ kind: 'scheme' })
    }
    expect(linkTarget('https://altro.test/x', at('/'))).toEqual({ kind: 'external' })
    expect(linkTarget('HTTP://altro.test', at('/'))).toEqual({ kind: 'external' })
  })

  it('risolve un link interno contro la pagina, senza query né ancora', () => {
    expect(linkTarget('/contatti?da=footer#modulo', at('/'))).toEqual({ kind: 'internal', path: '/contatti' })
    expect(linkTarget('chi-siamo', at('/news'))).toEqual({ kind: 'internal', path: '/chi-siamo' })
    expect(linkTarget('../storia', at('/news/ciao'))).toEqual({ kind: 'internal', path: '/storia' })
    expect(linkTarget(`${SITE}/bandi`, at('/'))).toEqual({ kind: 'internal', path: '/bandi' })
  })

  it('decodifica il percorso, e tiene così com’è quello che non si decodifica o non si legge', () => {
    expect(linkTarget('/caff%C3%A8', at('/'))).toEqual({ kind: 'internal', path: '/caffè' })
    expect(linkTarget('/100%', at('/'))).toEqual({ kind: 'internal', path: '/100%' })
    expect(linkTarget('http://[', at('/'))).toEqual({ kind: 'internal', path: 'http://[' })
  })
})

describe('servedPaths e servedBy', () => {
  const served = servedPaths(['/index.html', '/news/index.html', '/chi-siamo.html', '/menu.pdf'])
  const onDemand = [routePattern('/blog/[slug]'), routePattern('/docs/[...path]')]

  it('serve una pagina col suo percorso, con o senza barra finale, e ogni altro file col suo nome', () => {
    for (const path of ['/', '/news', '/news/', '/news/index.html', '/chi-siamo', '/menu.pdf']) {
      expect(servedBy(path, served, [])).toBe('build')
    }
    expect(servedBy('/manca', served, [])).toBeUndefined()
  })

  it('distingue un percorso che solo una rotta a richiesta riconosce, segmento rest compreso', () => {
    expect(servedBy('/blog/ciao/', served, onDemand)).toBe('on-demand')
    expect(servedBy('/docs', served, onDemand)).toBe('on-demand')
    expect(servedBy('/blog/ciao/altro', served, onDemand)).toBeUndefined()
  })
})

describe('linkReport', () => {
  const served = servedPaths(['/index.html', '/chi-siamo/index.html'])
  const footer = ['/chi-siamo', '/en/privacy', '#', 'https://altro.test', 'mailto:a@prova.test', '#su']

  it('raggruppa per destinazione, nomina le pagine e conta ciò che resta fuori', () => {
    const report = linkReport(
      [
        { route: '/chi-siamo', hrefs: footer },
        { route: '/', hrefs: [...footer, '', '/en/privacy/', '/blog/ciao'] },
      ],
      SITE,
      served,
      [routePattern('/blog/[slug]')],
    )

    expect(report.internal).toBe(6)
    expect(report.onDemand).toBe(1)
    expect(report.outside).toEqual({ external: 2, scheme: 2, anchor: 2 })
    expect(brokenLines(report)).toEqual([
      '/en/privacy ← /, /chi-siamo',
      'segnaposto href="" ← /',
      'segnaposto href="#" ← /, /chi-siamo',
    ])
  })

  it('nomina le prime tre pagine e conta le altre', () => {
    const pages = ['/a', '/b', '/c', '/d', '/e'].map((route) => ({ route, hrefs: ['/manca'] }))

    expect(brokenLines(linkReport(pages, SITE, served, []))).toEqual(['/manca ← /a, /b, /c e altre 2'])
  })
})
