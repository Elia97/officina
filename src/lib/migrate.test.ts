import { describe, expect, it } from 'vitest'

import { migrationEnv } from './migrate.ts'

const TEST_URL = 'postgres://prova@ep-test.neon.tech/neondb'

describe("l'ambiente dello script delle migrazioni", () => {
  it("dà l'indirizzo alla chiave di migrazione e toglie TEST_DATABASE_URL, lasciando il resto", () => {
    const env = { PATH: '/usr/bin', TEST_DATABASE_URL: TEST_URL }

    expect(migrationEnv(env, 'DATABASE_URL_UNPOOLED')).toEqual({
      env: { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: TEST_URL },
    })
  })

  it.each([
    ['assente', {}],
    ['vuota', { TEST_DATABASE_URL: '' }],
  ])("con TEST_DATABASE_URL %s non c'è un database da migrare", (_, env) => {
    expect(migrationEnv(env, 'DATABASE_URL_UNPOOLED')).toEqual({
      error:
        "`TEST_DATABASE_URL` è vuota: è l'indirizzo del branch di test, che `actions/ci` riceve con `database-url`",
    })
  })
})
