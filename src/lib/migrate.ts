import { parseEnv } from 'node:util'

import { SENSITIVE } from './check-placeholders.ts'

const TEST_DATABASE_URL = 'TEST_DATABASE_URL'

type Env = Readonly<Record<string, string | undefined>>

export type MigrationEnv = { env: Record<string, string | undefined>; url: string } | { error: string }

export function migrationEnv(env: Env, key: string): MigrationEnv {
  const { [TEST_DATABASE_URL]: url, ...rest } = env
  if (!url) {
    return {
      error: `\`${TEST_DATABASE_URL}\` è vuota: è l'indirizzo del branch di test, che \`actions/ci\` riceve con \`database-url\``,
    }
  }
  return { env: { ...rest, [key]: url }, url }
}

export function fileMigrationEnv(env: Env, content: string, key: string): MigrationEnv {
  const url = parseEnv(content)[key]
  if (url === undefined) {
    return {
      error: `\`${key}\` non c'è fra le variabili di Production che vercel pull ha scaricato: va aggiunta su Vercel, Encrypted e collegata a Production`,
    }
  }
  if (url.trim() === '') return { error: `\`${key}\` è vuota fra le variabili di Production su Vercel` }
  if (url.trim() === SENSITIVE) {
    return {
      error: `\`${key}\` è Sensitive su Vercel, e vercel pull non ne scarica il valore: va Encrypted, collegata a Production`,
    }
  }
  return { env: { ...env, [key]: url }, url }
}
