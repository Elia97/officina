import { describe, expect, it } from 'vitest'

import { checkSecurityHeaders, runChecks, type SmokeCheck } from './smoke-production.ts'
import { always, context } from './test-helpers/smoke-fetch.ts'

describe('i controlli dichiarati dal progetto', () => {
  it('sostituiscono la lista del pacchetto e girano nell’ordine dato, con contesto e pagine', async () => {
    const pages = [{ path: '/', type: 'text/html' }]
    const named =
      (check: string): SmokeCheck =>
      async (_context, received) => [{ check: `${check} su ${received.length} pagina`, status: 'pass' }]

    const results = await runChecks(context(always({})), pages, [named('primo'), named('secondo')])

    expect(results.map(({ check }) => check)).toEqual(['primo su 1 pagina', 'secondo su 1 pagina'])
  })
})

describe('gli header dichiarati dal progetto', () => {
  it('sono quelli che checkSecurityHeaders pretende, al posto di quelli del pacchetto', async () => {
    const smokeContext = { ...context(always({ headers: { 'x-frame-options': 'SAMEORIGIN' } })) }
    smokeContext.securityHeaders = { 'x-frame-options': 'SAMEORIGIN' }

    const results = await checkSecurityHeaders(smokeContext)

    expect(results.map(({ check, status }) => `${check}: ${status}`)).toEqual([
      'header x-frame-options: pass',
      'nessun x-robots-tag sull’host di produzione: pass',
    ])
  })
})
