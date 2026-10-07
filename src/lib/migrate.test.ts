import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { fileMigrationEnv, maskedValues, migrationEnv } from './migrate.ts'

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

const EMPTY =
  "è vuota fra le variabili di Production su Vercel: va riempita con l'indirizzo del database per le migrazioni"

describe("l'indirizzo dal file di vercel pull", () => {
  it("lo dà alla chiave di migrazione anche sopra quello del job, e nessun'altra variabile del file entra nell'ambiente", () => {
    const content = `${PULLED}DATABASE_URL_UNPOOLED="${PRODUCTION_URL}"\n`
    const job = { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: 'postgres://job@ep-job.neon.tech/neondb' }

    expect(fileMigrationEnv(job, content, 'DATABASE_URL_UNPOOLED')).toEqual({
      env: { PATH: '/usr/bin', DATABASE_URL_UNPOOLED: PRODUCTION_URL },
      url: PRODUCTION_URL,
    })
  })

  it.each([
    ['gli spazi ai bordi', `"  ${PRODUCTION_URL} "`],
    ['un a capo in coda', `"${PRODUCTION_URL}\\n"`],
  ])('lo dà senza %s, come lo legge vercel build', (_, value) => {
    expect(fileMigrationEnv({}, `${PULLED}DATABASE_URL_UNPOOLED=${value}\n`, 'DATABASE_URL_UNPOOLED')).toEqual({
      env: { DATABASE_URL_UNPOOLED: PRODUCTION_URL },
      url: PRODUCTION_URL,
    })
  })

  it.each([
    [
      'assente',
      '',
      "non c'è fra le variabili di Production che vercel pull ha scaricato: va aggiunta su Vercel, Encrypted e collegata a Production",
    ],
    ['vuota', 'DATABASE_URL_UNPOOLED=""\n', EMPTY],
    ['di soli spazi', 'DATABASE_URL_UNPOOLED="   "\n', EMPTY],
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
