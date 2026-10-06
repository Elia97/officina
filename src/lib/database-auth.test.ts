import { describe, expect, it } from 'vitest'

import type { ProjectFiles } from './alignment.ts'
import { databaseAuthGaps } from './database-auth.ts'

const SCHEMA = `export default defineConfig({
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),
      BETTER_AUTH_SECRET: envField.string({ context: 'server', access: 'secret' }),
    },
  },
})
`

const workflow = (job: string, action: string, inputs: string) =>
  `jobs:\n  ${job}:\n    steps:\n      - uses: Elia97/officina/actions/${action}@v0.12.0\n${inputs}`

const COMPLETE: Record<string, string> = {
  'astro.config.mjs': SCHEMA,
  'drizzle.config.ts': "export default defineConfig({ out: './drizzle' })\n",
  '.github/workflows/ci.yml': workflow(
    'ci',
    'ci',
    '        with:\n          migrate: db:migrate\n          database-url: postgres://branch-di-test\n',
  ),
  '.github/workflows/deploy.yml': workflow('deploy', 'deploy', '        with:\n          migrate: db:migrate\n'),
}

const SCRIPTS = { scripts: { 'db:generate': 'drizzle-kit generate', 'db:migrate': 'drizzle-kit migrate' } }

function project(overrides: Record<string, string | undefined> = {}): ProjectFiles {
  const contents: Record<string, string | undefined> = { ...COMPLETE, ...overrides }
  return { paths: [], read: (path) => contents[path] }
}

const messages = (gaps: { message: string }[]) => gaps.map(({ message }) => message)

describe('databaseAuthGaps', () => {
  it('non trova niente in un progetto con database e autenticazione al completo', () => {
    expect(databaseAuthGaps(project(), SCRIPTS, ['database', 'auth'])).toEqual([])
  })

  it('senza feature accese non chiede niente, nemmeno lo schema', () => {
    expect(databaseAuthGaps(project({ 'astro.config.mjs': undefined }), {}, [])).toEqual([])
  })

  it('ogni mancanza è un avviso, anche quelle dei workflow e dello schema', () => {
    const files = project({
      'astro.config.mjs':
        "export default defineConfig({ env: { schema: { DATABASE_URL: envField.string({ context: 'server', access: 'public' }) } } })\n",
      'drizzle.config.ts': undefined,
      '.github/workflows/ci.yml': 'jobs: [aperta\n',
      '.github/workflows/deploy.yml': workflow('deploy', 'deploy', ''),
    })
    const gaps = databaseAuthGaps(files, {}, ['database', 'auth'])

    expect(gaps).toHaveLength(7)
    expect(gaps.every(({ severity }) => severity === 'warning')).toBe(true)
  })
})

describe('databaseAuthGaps con il database', () => {
  it('elenca gli script e la configurazione di drizzle-kit che mancano', () => {
    expect(messages(databaseAuthGaps(project({ 'drizzle.config.ts': undefined }), {}, ['database']))).toEqual([
      'script `db:generate` assente: le migrazioni si generano dallo schema con quel nome',
      'script `db:migrate` assente: le migrazioni si applicano con quel nome, in CI e al deploy',
      'manca: drizzle-kit legge da lì la sua configurazione',
    ])
  })

  it('nomina gli input che i workflow non passano alle action', () => {
    const files = project({
      '.github/workflows/ci.yml': workflow('ci', 'ci', ''),
      '.github/workflows/deploy.yml': workflow('deploy', 'deploy', ''),
    })

    expect(messages(databaseAuthGaps(files, SCRIPTS, ['database']))).toEqual([
      '`Elia97/officina/actions/ci` non riceve `migrate`: il branch di test non si migra prima dei test',
      '`Elia97/officina/actions/ci` non riceve `database-url`: i test di integrazione si saltano',
      '`Elia97/officina/actions/deploy` non riceve `migrate`: la produzione parte con lo schema di prima',
    ])
  })
})

describe('databaseAuthGaps e lo schema delle variabili', () => {
  it('con la sola autenticazione chiede soltanto la sua chiave nello schema', () => {
    const files = project({ 'astro.config.mjs': 'export default defineConfig({})\n', 'drizzle.config.ts': undefined })

    expect(messages(databaseAuthGaps(files, {}, ['auth']))).toEqual([
      "`BETTER_AUTH_SECRET` non è in `env.schema`: va dichiarata con `context: 'server'` e `access: 'secret'`",
    ])
  })

  it('boccia una chiave che lo schema dichiara pubblica, lato server o lato client', () => {
    const schema = `export default defineConfig({
  env: {
    schema: {
      DATABASE_URL: envField.string({ context: 'server', access: 'public' }),
      BETTER_AUTH_SECRET: envField.string({ context: 'client', access: 'public' }),
    },
  },
})
`
    const reason =
      "non è `context: 'server'` con `access: 'secret'`: una variabile pubblica Astro la scrive nel codice della build"

    expect(messages(databaseAuthGaps(project({ 'astro.config.mjs': schema }), SCRIPTS, ['database', 'auth']))).toEqual([
      `\`DATABASE_URL\` in \`env.schema\` ${reason}`,
      `\`BETTER_AUTH_SECRET\` in \`env.schema\` ${reason}`,
    ])
  })

  it('senza astro.config.mjs lo dice una volta sola, per quante chiavi debba contenere', () => {
    expect(
      messages(databaseAuthGaps(project({ 'astro.config.mjs': undefined }), SCRIPTS, ['database', 'auth'])),
    ).toEqual(['manca: lo schema delle variabili, `env.schema`, sta lì'])
  })
})
