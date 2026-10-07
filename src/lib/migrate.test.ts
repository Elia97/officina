import { describe, expect, it } from 'vitest'

import { maskedValues, migrationEnv } from './migrate.ts'

const TEST_URL = 'postgres://prova@ep-test.neon.tech/neondb'
const PRODUCTION_URL = 'postgres://produzione@ep-prod.neon.tech/neondb'

const FROM_TEST =
  "`TEST_DATABASE_URL` è vuota: è l'indirizzo del branch di test, che `actions/ci` riceve con `database-url`"
const FROM_PRODUCTION =
  "`PRODUCTION_DATABASE_URL` è vuota: è l'indirizzo di produzione, che `actions/deploy` riceve con `database-url` dal segreto `PRODUCTION_DATABASE_URL` dell'environment `production`, dichiarato dal job di deploy"

describe("l'ambiente dello script delle migrazioni", () => {
  it.each([
    ['test', 'TEST_DATABASE_URL', TEST_URL],
    ['production', 'PRODUCTION_DATABASE_URL', PRODUCTION_URL],
  ] as const)(
    'per %s dà %s alla chiave di migrazione, anche sopra quella del job, e lo toglie',
    (target, variable, url) => {
      const env = { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: 'postgres://job@ep-job.neon.tech/neondb', [variable]: url }

      expect(migrationEnv(env, 'DATABASE_URL_UNPOOLED', target)).toEqual({
        env: { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: url },
        url,
      })
    },
  )

  it.each([
    ['test', 'assente', { PRODUCTION_DATABASE_URL: PRODUCTION_URL }, FROM_TEST],
    ['test', 'vuota', { TEST_DATABASE_URL: '' }, FROM_TEST],
    ['production', 'assente', { TEST_DATABASE_URL: TEST_URL }, FROM_PRODUCTION],
    ['production', 'vuota', { PRODUCTION_DATABASE_URL: '' }, FROM_PRODUCTION],
  ] as const)("per %s, con la sua variabile %s, non c'è un database da migrare", (target, _, env, error) => {
    expect(migrationEnv(env, 'DATABASE_URL_UNPOOLED', target)).toEqual({ error })
  })
})

describe('le maschere dello script delle migrazioni', () => {
  it.each([
    ['con la password', 'postgres://produzione:segreta@ep-prod.neon.tech/neondb', ['segreta']],
    ['con la password codificata', 'postgres://produzione:p%40ss%25@ep-prod.neon.tech/neondb', ['p%40ss%25', 'p@ss%']],
    ['con una codifica rotta', 'postgres://produzione:p%E0%A4%A@ep-prod.neon.tech/neondb', ['p%E0%A4%A']],
    ['senza password', 'postgres://produzione@ep-prod.neon.tech/neondb', []],
    ['che non si legge', 'non è un indirizzo', []],
  ])("un indirizzo %s dà sé stesso, e la password com'è e decodificata", (_, url, password) => {
    expect(maskedValues(url)).toEqual([url, ...password])
  })
})
