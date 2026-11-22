import { describe, expect, it } from 'vitest'

import { envSchema } from './env-schema.ts'

const CONFIG = `import { defineConfig, envField } from 'astro/config'

export default defineConfig({
  env: {
    schema: {
      // DATABASE_URL: envField.string({ context: 'client', access: 'public' }),
      DATABASE_URL: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      'BETTER_AUTH_SECRET': envField.string({ context: 'server', access: 'secret' }),
      PUBLIC_GTM_ID: envField.string({ context: 'client', access: 'public', optional: true }),
      BOTID_ENFORCE: envField.boolean({ context: 'server', access: 'public', default: false }),
      DIRECT_URL: envField.string({ context: 'server', access: 'secret', url: true }),
    },
  },
})
`

describe('envSchema', () => {
  it('legge chiave, tipo, context, access e validazioni di ogni envField, anche con la chiave fra apici', () => {
    expect(envSchema(CONFIG)).toEqual({
      unreadable: [],
      fields: [
        { key: 'DATABASE_URL', type: 'string', context: 'server', access: 'secret', constrained: false },
        { key: 'BETTER_AUTH_SECRET', type: 'string', context: 'server', access: 'secret', constrained: false },
        { key: 'PUBLIC_GTM_ID', type: 'string', context: 'client', access: 'public', constrained: false },
        { key: 'BOTID_ENFORCE', type: 'boolean', context: 'server', access: 'public', constrained: false },
        { key: 'DIRECT_URL', type: 'string', context: 'server', access: 'secret', constrained: true },
      ],
    })
  })

  it('non conta un campo commentato', () => {
    expect(envSchema(CONFIG).fields.filter(({ key }) => key === 'DATABASE_URL')).toHaveLength(1)
  })

  it('nomina ogni voce che non sa leggere, invece di contare meno chiavi, e salta un envField fuori dallo schema', () => {
    const source = `const SERVER = 'server'
const secret = { context: SERVER, access: 'secret' }
const reused = envField.string({ context: 'server', access: 'secret' })
export default defineConfig({
  env: {
    schema: {
      ...vetrinaFields,
      A: envField.string(secret),
      B: envField.string({ context: SERVER, access: 'secret' }),
      C: envField.string({ access: 'secret' }),
      D: reused,
      SERVER,
      [SERVER]: envField.string({ context: 'server', access: 'secret' }),
      E: envField.string({ context: 'server', access: 'secret' }),
    },
  },
})
`
    const notLiteral = '`context` e `access` non sono scritti per esteso, come stringhe'

    expect(envSchema(source)).toEqual({
      fields: [{ key: 'E', type: 'string', context: 'server', access: 'secret', constrained: false }],
      unreadable: [
        { entry: '...vetrinaFields', reason: 'uno spread, le cui chiavi stanno in un altro punto del codice' },
        { entry: 'A', reason: notLiteral },
        { entry: 'B', reason: notLiteral },
        { entry: 'C', reason: notLiteral },
        { entry: 'D', reason: 'il valore non è una chiamata `envField`' },
        { entry: 'SERVER', reason: 'il valore non è una chiamata `envField`' },
        { entry: '[SERVER]', reason: 'la chiave è calcolata, non scritta' },
      ],
    })
  })

  it('nomina uno schema o un env che non sono un oggetto scritto lì', () => {
    const imported = 'export default defineConfig({ env: { schema: projectEnvSchema } })\n'
    const shorthand = 'export default defineConfig({ env })\n'

    expect(envSchema(imported).unreadable).toEqual([{ entry: 'schema', reason: 'non è un oggetto scritto lì' }])
    expect(envSchema(shorthand).unreadable).toEqual([{ entry: 'env', reason: 'non è un oggetto scritto lì' }])
  })

  it('senza env.schema non trova chiavi, e nemmeno voci da nominare', () => {
    expect(envSchema('export default defineConfig({ env: {} })\n')).toEqual({ fields: [], unreadable: [] })
  })
})
