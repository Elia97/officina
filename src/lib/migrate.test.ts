import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fileMigrationEnv, migrationEnv } from './migrate.ts'

const TEST_URL = 'postgres://prova@ep-test.neon.tech/neondb'
const PRODUCTION_URL = 'postgres://produzione@ep-prod.neon.tech/neondb'

describe("l'ambiente dello script delle migrazioni", () => {
  it("dà l'indirizzo alla chiave di migrazione e toglie TEST_DATABASE_URL, lasciando il resto", () => {
    const env = { PATH: '/usr/bin', TEST_DATABASE_URL: TEST_URL }

    expect(migrationEnv(env, 'DATABASE_URL_UNPOOLED')).toEqual({
      env: { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: TEST_URL },
      url: TEST_URL,
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

const PULLED = readFileSync(new URL('./test-helpers/vercel-pull-59.22.0.env', import.meta.url), 'utf8')

describe("l'indirizzo dal file di vercel pull", () => {
  it("lo dà alla chiave di migrazione, e nessun'altra variabile del file entra nell'ambiente", () => {
    const content = `${PULLED}DATABASE_URL_UNPOOLED="${PRODUCTION_URL}"\n`

    expect(fileMigrationEnv({ PATH: '/usr/bin' }, content, 'DATABASE_URL_UNPOOLED')).toEqual({
      env: { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: PRODUCTION_URL },
      url: PRODUCTION_URL,
    })
  })

  it.each([
    [
      'assente',
      '',
      "non c'è fra le variabili di Production che vercel pull ha scaricato: va aggiunta su Vercel, Encrypted e collegata a Production",
    ],
    ['vuota', 'DATABASE_URL_UNPOOLED=""\n', 'è vuota fra le variabili di Production su Vercel'],
    [
      'Sensitive',
      'DATABASE_URL_UNPOOLED="[SENSITIVE]"\n',
      'è Sensitive su Vercel, e vercel pull non ne scarica il valore: va Encrypted, collegata a Production',
    ],
  ])('con la chiave %s non dà un indirizzo, e dice cosa fare su Vercel', (_, line, message) => {
    expect(fileMigrationEnv({}, `${PULLED}${line}`, 'DATABASE_URL_UNPOOLED')).toEqual({
      error: `\`DATABASE_URL_UNPOOLED\` ${message}`,
    })
  })
})
