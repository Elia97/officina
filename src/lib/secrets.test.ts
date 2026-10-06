import { describe, expect, it } from 'vitest'

import type { EnvField } from './env-schema.ts'
import { canary, canaryLines, scanSecrets, secretFields } from './secrets.ts'

const field = (key: string, type: string, context: string, access: string, constrained = false): EnvField => ({
  key,
  type,
  context,
  access,
  constrained,
})

const SCHEMA: EnvField[] = [
  field('BREVO_API_KEY', 'string', 'server', 'secret'),
  field('RETRIES', 'number', 'server', 'secret'),
  field('DIRECT_URL', 'string', 'server', 'secret', true),
  field('CONTACT_TO_EMAIL', 'string', 'server', 'public'),
  field('PUBLIC_GTM_ID', 'string', 'client', 'public'),
  field('BREVO_API_KEY', 'string', 'server', 'secret'),
]

const KEY = 'BREVO_API_KEY'
const VALUE = 'xkeysib-0123456789abcdef'

const scan = (keys: string[], env: Record<string, string>, contents: Record<string, string>) =>
  scanSecrets(keys, env, Object.keys(contents), (path) => Buffer.from(contents[path] ?? ''))

const leak = (path: string, what: string, key = KEY) => ({
  path,
  severity: 'error',
  message: `contiene ${what} di \`${key}\`, una chiave server e secret di env.schema`,
})

describe('secretFields e canaryLines', () => {
  it('prendono una volta ogni chiave server e secret, e danno un canary solo alle stringhe senza validazioni', () => {
    expect(secretFields(SCHEMA).map(({ key }) => key)).toEqual(['BREVO_API_KEY', 'RETRIES', 'DIRECT_URL'])
    expect(canaryLines(secretFields(SCHEMA))).toEqual(['BREVO_API_KEY=officina-BREVO_API_KEY-canary'])
  })
})

describe('scanSecrets e il valore della chiave', () => {
  it('trova il valore della chiave in un file, e nomina la chiave e il file', () => {
    const contents = { 'dist/client/_astro/a.js': `fetch(u,{key:"${VALUE}"})`, 'dist/client/index.html': '<p>ok</p>' }

    expect(scan([KEY], { [KEY]: VALUE }, contents)).toEqual({
      findings: [leak('dist/client/_astro/a.js', 'il valore')],
      verified: [],
    })
  })

  it('trova il valore anche nelle forme in cui Astro lo scrive nel markup e negli script', () => {
    const url = 'postgres://u:p@db.test/shop?sslmode=require&channel_binding=require'
    const pem = '-----BEGIN KEY-----\nabc<def\n-----END KEY-----'
    const contents = {
      'dist/client/index.html':
        '<div data-url="postgres://u:p@db.test/shop?sslmode=require&amp;channel_binding=require">',
      'dist/client/script.html': `<script>const k = "-----BEGIN KEY-----\\nabc\\u003cdef\\n-----END KEY-----"</script>`,
    }

    expect(scan(['URL', 'PEM'], { URL: url, PEM: pem }, contents).findings).toEqual([
      leak('dist/client/index.html', 'il valore', 'URL'),
      leak('dist/client/script.html', 'il valore', 'PEM'),
    ])
  })
})

describe('scanSecrets e il canary', () => {
  it("trova il canary, anche quando l'ambiente non lo contiene", () => {
    const contents = { 'dist/client/index.html': `<script>const k = "${canary(KEY)}"</script>` }

    expect(scan([KEY], { [KEY]: canary(KEY) }, contents).findings).toEqual([
      leak('dist/client/index.html', 'il canary'),
    ])
    expect(scan([KEY], {}, contents).findings).toEqual([leak('dist/client/index.html', 'il canary')])
  })

  it('non attribuisce a una chiave il canary di un’altra che la contiene nel nome', () => {
    const contents = { 'dist/client/a.js': `"${canary('DATABASE_URL_UNPOOLED')}"` }

    expect(scan(['DATABASE_URL', 'DATABASE_URL_UNPOOLED'], {}, contents).findings).toEqual([
      leak('dist/client/a.js', 'il canary', 'DATABASE_URL_UNPOOLED'),
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('`DATABASE_URL`') }),
    ])
  })

  it('riporta una volta sola un file che contiene il valore e il canary', () => {
    const contents = { 'dist/client/a.js': `"${VALUE}" + "${canary(KEY)}"` }

    expect(scan([KEY], { [KEY]: `  ${VALUE}  ` }, contents).findings).toEqual([leak('dist/client/a.js', 'il canary')])
  })
})

describe('scanSecrets e le chiavi verificate', () => {
  it('conta fra le verificate una chiave che non compare in nessun file', () => {
    expect(scan([KEY], { [KEY]: canary(KEY) }, { 'dist/client/index.html': '<p>ok</p>' })).toEqual({
      findings: [],
      verified: [KEY],
    })
  })

  it('non verifica una chiave senza valore né canary, o con un valore troppo corto, e lo dice', () => {
    const { findings, verified } = scan(['A', 'B'], { B: 'corto' }, { 'dist/client/index.html': '<p>corto</p>' })

    expect(verified).toEqual([])
    expect(findings).toEqual([
      {
        path: 'astro.config.mjs',
        severity: 'warning',
        message: "`A` non si verifica: nell'ambiente non ci sono né il suo valore né il canary",
      },
      {
        path: 'astro.config.mjs',
        severity: 'warning',
        message: '`B` non si verifica: il suo valore ha meno di 8 caratteri, e cercarlo darebbe falsi positivi',
      },
    ])
  })
})
