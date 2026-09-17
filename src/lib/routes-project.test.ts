import { describe, expect, it } from 'vitest'

import { expectedRoutes, missingRouteFailures, smokeRoutes } from './routes.ts'

const expected = expectedRoutes([{ file: 'src/pages/index.astro', source: '' }], 'src/pages')

describe('missingRouteFailures', () => {
  it('boccia una dist senza HTML invece di non affermare niente', () => {
    expect(missingRouteFailures(expected, [], 'dist/client')).toEqual([
      'dist/client holds no .html file — no route was measured, so the per-route budgets assert nothing',
    ])
  })

  it('nomina la pagina prerenderizzata che non ha emesso il suo HTML', () => {
    expect(missingRouteFailures(expected, ['/contatti'], 'dist/client')).toEqual([
      'missing route / — src/pages/index.astro is prerendered but emitted no HTML',
    ])
  })
})

describe('smokeRoutes', () => {
  it('prende dal progetto le rotte non HTML, al posto di quelle del pacchetto', () => {
    const routes = smokeRoutes(expected, [{ path: '/og.png', type: 'image/png' }])

    expect(routes).toEqual([
      { path: '/', type: 'text/html' },
      { path: '/og.png', type: 'image/png' },
    ])
  })
})
