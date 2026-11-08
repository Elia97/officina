import { describe, expect, it } from 'vitest'

import { baseUrlArg, type LighthouseRc, lighthouseConfig } from './lighthouse.ts'

const rc = (): LighthouseRc => ({
  ci: {
    collect: {
      startServerCommand: 'pnpm dlx serve@14 dist/client --listen 4321 --no-clipboard',
      startServerReadyPattern: 'Accepting connections',
      startServerReadyTimeout: 120000,
      numberOfRuns: 3,
    },
    assert: { assertions: { 'categories:seo': ['error', { minScore: 0.95 }] } },
    upload: { target: 'temporary-public-storage' },
  },
})

describe('lighthouseConfig', () => {
  it('mette un URL per rotta sulla porta predefinita e lascia intatto il resto', () => {
    const { ci } = lighthouseConfig(rc(), ['/', '/contatti'], {})

    expect(ci.collect.url).toEqual(['http://localhost:4321/', 'http://localhost:4321/contatti'])
    expect(ci.collect.numberOfRuns).toBe(3)
    expect(ci.assert).toEqual(rc().ci.assert)
    expect(ci.upload).toEqual({ target: 'temporary-public-storage' })
  })

  it('porta la porta scelta sia negli URL sia nel comando del server', () => {
    const { ci } = lighthouseConfig(rc(), ['/'], { LH_PORT: '4399' })

    expect(ci.collect.url).toEqual(['http://localhost:4399/'])
    expect(ci.collect.startServerCommand).toContain('--listen 4399')
  })

  it('non inventa un comando del server che il progetto non dichiara', () => {
    const bare: LighthouseRc = { ci: { collect: {} } }

    expect(lighthouseConfig(bare, ['/'], {}).ci.collect.startServerCommand).toBeUndefined()
  })

  it('con un server esterno toglie tutto ciò che lo avvierebbe', () => {
    const { collect } = lighthouseConfig(rc(), ['/'], { LH_EXTERNAL_SERVER: '1' }).ci

    expect(collect.startServerCommand).toBeUndefined()
    expect(collect.startServerReadyPattern).toBeUndefined()
    expect(collect.startServerReadyTimeout).toBeUndefined()
  })

  it('piega giri, flag di Chrome e destinazione del report al giro locale', () => {
    const { ci } = lighthouseConfig(rc(), ['/'], {
      LH_RUNS: '1',
      LH_CHROME_FLAGS: '--no-sandbox',
      LH_OUT: '.lighthouseci/local',
    })

    expect(ci.collect.numberOfRuns).toBe(1)
    expect(ci.collect.settings).toEqual({ chromeFlags: '--no-sandbox' })
    expect(ci.upload).toEqual({ target: 'filesystem', outputDir: '.lighthouseci/local' })
  })

  it('non tocca il file letto dal progetto', () => {
    const original = rc()

    lighthouseConfig(original, ['/'], { LH_EXTERNAL_SERVER: '1', LH_OUT: 'out' })

    expect(original).toEqual(rc())
  })
})

const assertions = {
  'categories:accessibility': ['error', { minScore: 0.95 }],
  'categories:seo': ['error', { minScore: 0.95 }],
}

const withAssert = (assert: Record<string, unknown>): LighthouseRc => ({ ci: { collect: {}, assert } })

const seoPattern = (assert: unknown): RegExp => {
  const { assertMatrix } = assert as { assertMatrix: { matchingUrlPattern?: string }[] }
  return new RegExp(assertMatrix.at(-1)?.matchingUrlPattern ?? '')
}

describe('le pagine in noindex e il SEO', () => {
  it("le misura su tutto il resto, e toglie l'asserzione sul SEO solo a loro", () => {
    const { ci } = lighthouseConfig(withAssert({ assertions }), ['/', '/en/terms'], {}, new Set(['/en/terms']))

    expect(ci.assert).toEqual({
      assertMatrix: [
        { assertions: { 'categories:accessibility': ['error', { minScore: 0.95 }] } },
        {
          matchingUrlPattern: '^(?!(?:http://localhost:4321/en/terms)/?$)',
          assertions: { 'categories:seo': ['error', { minScore: 0.95 }] },
        },
      ],
    })
    const pattern = seoPattern(ci.assert)
    expect(pattern.test('http://localhost:4321/')).toBe(true)
    expect(pattern.test('http://localhost:4321/en/terms')).toBe(false)
    expect(pattern.test('http://localhost:4321/en/terms/')).toBe(false)
    expect(pattern.test('http://localhost:4321/en/terms-of-sale')).toBe(true)
  })

  it("protegge i caratteri dell'URL che in una regex direbbero altro", () => {
    const { ci } = lighthouseConfig(
      withAssert({ assertions }),
      ['/a.b'],
      { LH_BASE_URL: 'https://acme.test' },
      new Set(['/a.b']),
    )

    expect(seoPattern(ci.assert).test('https://acme.test/a.b')).toBe(false)
    expect(seoPattern(ci.assert).test('https://acme-test/aXb')).toBe(true)
  })
})

describe('le opzioni di assert del progetto e la matrice', () => {
  it('porta is-crawlable con il SEO, e aggregationMethod in ogni voce', () => {
    const assert = { aggregationMethod: 'median', assertions: { 'is-crawlable': 'error' } }
    const { ci } = lighthouseConfig(withAssert(assert), ['/x'], {}, new Set(['/x']))

    expect(ci.assert).toEqual({
      assertMatrix: [
        {
          aggregationMethod: 'median',
          matchingUrlPattern: '^(?!(?:http://localhost:4321/x)/?$)',
          assertions: { 'is-crawlable': 'error' },
        },
      ],
    })
  })

  it('lascia includePassedAssertions sopra la matrice, dove LHCI lo legge', () => {
    const assert = { includePassedAssertions: true, assertions: { 'categories:seo': 'error' } }
    const { ci } = lighthouseConfig(withAssert(assert), ['/x'], {}, new Set(['/x']))

    expect(ci.assert).toEqual({
      includePassedAssertions: true,
      assertMatrix: [
        { matchingUrlPattern: '^(?!(?:http://localhost:4321/x)/?$)', assertions: { 'categories:seo': 'error' } },
      ],
    })
  })

  it.each([
    ['senza pagine in noindex', { assertions }, new Set<string>()],
    ['con un preset', { preset: 'lighthouse:recommended', assertions }, new Set(['/x'])],
    ['senza asserzioni sul SEO', { assertions: { 'categories:performance': 'warn' } }, new Set(['/x'])],
    ['senza nessuna asserzione', { aggregationMethod: 'median' }, new Set(['/x'])],
  ])('%s lascia le asserzioni come le scrive il progetto', (_, assert, noindex) => {
    expect(lighthouseConfig(withAssert(assert), ['/x'], {}, noindex).ci.assert).toEqual(assert)
  })
})

describe('la porta e il sito da misurare', () => {
  it.each([
    ['pnpm exec astro dev --port 4321', 'pnpm exec astro dev --port 4399'],
    ['pnpm exec astro dev --port=4321', 'pnpm exec astro dev --port=4399'],
    ['pnpm dlx serve@14 dist/client --listen=4321', 'pnpm dlx serve@14 dist/client --listen=4399'],
  ])('porta la porta scelta anche in «%s»', (command, expected) => {
    const custom: LighthouseRc = { ci: { collect: { startServerCommand: command } } }

    expect(lighthouseConfig(custom, ['/'], { LH_PORT: '4399' }).ci.collect.startServerCommand).toBe(expected)
  })

  it('con un URL di base misura quel sito, e non avvia il server del progetto', () => {
    const { collect } = lighthouseConfig(rc(), ['/', '/contatti'], { LH_BASE_URL: 'https://acme.test' }).ci

    expect(collect.url).toEqual(['https://acme.test/', 'https://acme.test/contatti'])
    expect(collect.startServerCommand).toBeUndefined()
    expect(collect.startServerReadyPattern).toBeUndefined()
  })
})

describe('baseUrlArg', () => {
  it('senza argomenti non chiede nessun URL', () => {
    expect(baseUrlArg(['--local'])).toEqual({})
  })

  it("prende l'URL http(s) e ne toglie le barre finali", () => {
    expect(baseUrlArg(['https://acme.test//'])).toEqual({ url: 'https://acme.test' })
  })

  it.each(['acme.test', 'ftp://acme.test'])('rifiuta %s, che non è un sito da visitare', (arg) => {
    expect(baseUrlArg([arg]).error).toContain(`${arg} non è un URL http(s)`)
  })
})
