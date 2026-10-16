import { describe, expect, it } from 'vitest'

import { checkSecurityHeaders } from './smoke-production.ts'
import { always, context, secureHeaders } from './test-helpers/smoke-fetch.ts'

const VERCEL = 'https://prova.vercel.app'

async function robotsResult(robots: Record<string, string>, baseUrl = VERCEL, siteUrl?: string) {
  const smokeContext = context(always({ headers: { ...secureHeaders(), ...robots } }), baseUrl)
  if (siteUrl !== undefined) smokeContext.siteUrl = siteUrl
  return (await checkSecurityHeaders(smokeContext)).at(-1)
}

describe('il noindex su un indirizzo di Vercel che non è siteUrl', () => {
  it.each(['noindex, nofollow', 'none', 'NOINDEX'])('passa con «%s», come lo mette vercel.json', async (value) => {
    expect(await robotsResult({ 'x-robots-tag': value })).toEqual({
      check: 'x-robots-tag noindex sull’indirizzo di Vercel',
      status: 'pass',
    })
  })

  it('senza x-robots-tag fallisce: un indirizzo di Vercel indicizzabile è il guasto', async () => {
    expect(await robotsResult({})).toMatchObject({ status: 'fail', detail: `assente su ${VERCEL}` })
  })

  it.each(['nofollow', 'max-image-preview:none', 'googlebot: noindex'])(
    'con «%s», che non toglie l’indice a tutti i motori, fallisce e ne dice il valore',
    async (value) => {
      expect(await robotsResult({ 'x-robots-tag': value })).toMatchObject({
        status: 'fail',
        detail: `senza noindex su ${VERCEL}: "${value}"`,
      })
    },
  )
})

describe('il controllo di sempre, nessun x-robots-tag', () => {
  it('resta su siteUrl anche quando è un indirizzo di Vercel, con le maiuscole o la barra finale', async () => {
    expect(await robotsResult({}, VERCEL, 'https://Prova.vercel.app/')).toEqual({
      check: 'nessun x-robots-tag sull’host di produzione',
      status: 'pass',
    })
  })

  it('resta su un host che non è di Vercel, anche quando non è siteUrl', async () => {
    expect(await robotsResult({ 'x-robots-tag': 'noindex' }, 'https://anteprima.prova.test')).toMatchObject({
      check: 'nessun x-robots-tag sull’host di produzione',
      status: 'fail',
    })
  })

  it('resta su un host che finisce con vercel.app senza esserne un sottodominio', async () => {
    expect(await robotsResult({}, 'https://provavercel.app')).toEqual({
      check: 'nessun x-robots-tag sull’host di produzione',
      status: 'pass',
    })
  })
})
