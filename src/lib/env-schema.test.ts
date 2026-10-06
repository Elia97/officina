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
    },
  },
})
`

describe('envSchema', () => {
  it('legge chiave, context e access di ogni envField, anche con la chiave fra apici', () => {
    expect(envSchema(CONFIG)).toEqual([
      { key: 'DATABASE_URL', context: 'server', access: 'secret' },
      { key: 'BETTER_AUTH_SECRET', context: 'server', access: 'secret' },
      { key: 'PUBLIC_GTM_ID', context: 'client', access: 'public' },
      { key: 'BOTID_ENFORCE', context: 'server', access: 'public' },
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
      { key: 'A', context: undefined, access: undefined },
      { key: 'B', context: undefined, access: 'secret' },
      { key: 'C', context: undefined, access: 'secret' },
    ])
  })
})
