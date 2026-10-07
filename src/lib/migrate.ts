const TEST_DATABASE_URL = 'TEST_DATABASE_URL'

export type MigrationEnv = { env: Record<string, string | undefined> } | { error: string }

export function migrationEnv(env: Readonly<Record<string, string | undefined>>, key: string): MigrationEnv {
  const { [TEST_DATABASE_URL]: url, ...rest } = env
  if (!url) {
    return {
      error: `\`${TEST_DATABASE_URL}\` è vuota: è l'indirizzo del branch di test, che \`actions/ci\` riceve con \`database-url\``,
    }
  }
  return { env: { ...rest, [key]: url } }
}
