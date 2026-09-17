import { describe, expect, it } from 'vitest'

import { type LighthouseRc, lighthouseConfig } from './lighthouse.ts'

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
