import { describe, expect, it } from 'vitest'

import { htmlStylesheets } from './bundle-budget.ts'

const link = (attributes: string) => `<link ${attributes}>`

describe('htmlStylesheets', () => {
  it('prende i fogli locali che la pagina collega, una volta ciascuno', () => {
    const html = [
      link('rel="stylesheet" href="/_astro/main.css"'),
      link('rel="stylesheet" href="/_astro/slug.css"'),
      link('href="/_astro/main.css" rel="stylesheet"'),
      link('rel="stylesheet" href="https://fonts.example.com/x.css"'),
    ].join('')

    expect(htmlStylesheets(html).sort()).toEqual(['main.css', 'slug.css'])
  })

  it.each([
    ['sotto una base', 'rel="stylesheet" href="/sub/_astro/main.css"', 'main.css'],
    ['da un assetsPrefix', 'rel="stylesheet" href="https://cdn.example.com/_astro/main.css"', 'main.css'],
    ['con la query della skew protection', 'rel="stylesheet" href="/_astro/main.css?dpl=dpl_123"', 'main.css'],
    ['fra apici singoli', "rel='stylesheet' href='/_astro/main.css'", 'main.css'],
    ['in una sottocartella di _astro', 'rel="stylesheet" href="/_astro/sub/x.css"', 'sub/x.css'],
  ])('riconosce il foglio %s', (_, attributes, name) => {
    expect(htmlStylesheets(link(attributes))).toEqual([name])
  })

  it.each([
    ['un prefetch', 'rel="prefetch" href="/_astro/b.css"'],
    ['un preload', 'rel="preload" as="style" href="/_astro/b.css"'],
  ])('non conta %s, che non blocca il rendering', (_, attributes) => {
    expect(htmlStylesheets(link(attributes))).toEqual([])
  })
})
