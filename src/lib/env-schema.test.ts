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
    expect(envSchema(CONFIG)).toEqual([
      { key: 'DATABASE_URL', type: 'string', context: 'server', access: 'secret', constrained: false },
      { key: 'BETTER_AUTH_SECRET', type: 'string', context: 'server', access: 'secret', constrained: false },
      { key: 'PUBLIC_GTM_ID', type: 'string', context: 'client', access: 'public', constrained: false },
      { key: 'BOTID_ENFORCE', type: 'boolean', context: 'server', access: 'public', constrained: false },
      { key: 'DIRECT_URL', type: 'string', context: 'server', access: 'secret', constrained: true },
    ])
  })

  it('non conta un campo commentato', () => {
    expect(envSchema(CONFIG).filter(({ key }) => key === 'DATABASE_URL')).toHaveLength(1)
  })

  it('lascia indefinito ciò che non è una stringa scritta lì, e salta un envField fuori dallo schema', () => {
    const source = `const SERVER = 'server'
const secret = { context: SERVER, access: 'secret' }
const reused = envField.string({ context: 'server', access: 'secret' })
export default defineConfig({
  env: {
    schema: {
      A: envField.string(secret),
      B: envField.string({ context: SERVER, access: 'secret' }),
      C: envField.string({ access: 'secret' }),
      D: reused,
    },
  },
})
`

    expect(envSchema(source)).toEqual([
      { key: 'A', type: 'string', context: undefined, access: undefined, constrained: false },
      { key: 'B', type: 'string', context: undefined, access: 'secret', constrained: false },
      { key: 'C', type: 'string', context: undefined, access: 'secret', constrained: false },
    ])
  })
})
