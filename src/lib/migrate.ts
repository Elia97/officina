type Env = Readonly<Record<string, string | undefined>>

export type MigrationEnv = { env: Record<string, string | undefined>; url: string } | { error: string }

export type MigrationTarget = 'test' | 'production'

const SOURCES: Record<MigrationTarget, { variable: string; origin: string }> = {
  test: {
    variable: 'TEST_DATABASE_URL',
    origin: "è l'indirizzo del branch di test, che `actions/ci` riceve con `database-url`",
  },
  production: {
    variable: 'PRODUCTION_DATABASE_URL',
    origin:
      "è l'indirizzo di produzione, che `actions/deploy` riceve con `database-url` dal segreto `PRODUCTION_DATABASE_URL` dell'environment `production`, dichiarato dal job di deploy",
  },
}

export function migrationEnv(env: Env, key: string, target: MigrationTarget): MigrationEnv {
  const { variable, origin } = SOURCES[target]
  const { [variable]: url, ...rest } = env
  if (!url) return { error: `\`${variable}\` è vuota: ${origin}` }
  return { env: { ...rest, [key]: url }, url }
}

const decoded = (text: string): string => {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export function maskedValues(url: string): string[] {
  const password = URL.parse(url)?.password ?? ''
  return [...new Set(password === '' ? [url] : [url, password, decoded(password)])]
}
