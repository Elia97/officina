import { describe, expect, it } from 'vitest'

import { routePattern } from './routes.ts'

describe('routePattern e i segmenti misti', () => {
  it('tiene il letterale prima del parametro', () => {
    const pattern = routePattern('/post-[id]')

    expect(pattern.test('/post-42')).toBe(true)
    expect(pattern.test('/post-')).toBe(false)
    expect(pattern.test('/post-42/altro')).toBe(false)
  })

  it('tiene il letterale dopo il parametro', () => {
    const pattern = routePattern('/blog/[slug].md')

    expect(pattern.test('/blog/ciao.md')).toBe(true)
    expect(pattern.test('/blog/cancellato')).toBe(false)
  })

  it('legge due parametri nello stesso segmento', () => {
    expect(routePattern('/[lang]-[version]/docs').test('/it-2/docs')).toBe(true)
  })

  it('scappa i caratteri di regex di un letterale', () => {
    expect(routePattern('/file.[ext]').test('/fileXpdf')).toBe(false)
    expect(routePattern('/file.[ext]').test('/file.pdf')).toBe(true)
  })

  it('lascia com’è il segmento rest finale, che accetta anche il percorso nudo', () => {
    const pattern = routePattern('/news/[...page]')

    expect(pattern.test('/news')).toBe(true)
    expect(pattern.test('/news/2/3')).toBe(true)
    expect(pattern.test('/newsletter')).toBe(false)
  })
})
