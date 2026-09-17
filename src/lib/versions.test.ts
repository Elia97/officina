import { describe, expect, it } from 'vitest'

import { packageVersion, peerRange, withinRange } from './versions.ts'

describe('la versione del pacchetto', () => {
  it('è quella del suo package.json, che è anche la versione del contratto', () => {
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("dichiara l'intervallo di Biome che il preset regge, e niente per chi non è un peer", () => {
    expect(peerRange('@biomejs/biome')).toMatch(/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/)
    expect(peerRange('pacchetto-inesistente')).toBe('')
  })
})

describe('withinRange', () => {
  const RANGE = '>=2.5.10 <3.0.0'

  it.each(['2.5.10', '=2.5.10', '2.9.0', '^2.5.10', '~2.5.10', '^2.6.0'])('accetta %s', (spec) => {
    expect(withinRange(spec, RANGE)).toBe(true)
  })

  it.each(['2.5.9', '^2.4.0', '~2.4.0', '3.0.0', '^3.0.0'])('rifiuta %s, che esce dai bordi', (spec) => {
    expect(withinRange(spec, RANGE)).toBe(false)
  })

  it('rifiuta quello che non sa leggere invece di lasciarlo passare', () => {
    expect(withinRange('latest', RANGE)).toBe(false)
    expect(withinRange('>=2.5.10', RANGE)).toBe(false)
    expect(withinRange('2.x', RANGE)).toBe(false)
    expect(withinRange('2.5.10', '^2.5.10')).toBe(false)
    expect(withinRange('2.5.10', '>=2.5.10 2.9.0')).toBe(false)
    expect(withinRange('2.5.10', '>=2.5.10 <3.0.0 <4.0.0')).toBe(false)
    expect(withinRange('2.5.10', '>=due <3.0.0')).toBe(false)
    expect(withinRange('2.5.10', '>=2.5.10 <tre')).toBe(false)
  })

  it('sotto lo zero il caret sale solo di minor, come fa npm', () => {
    expect(withinRange('^0.15.1', '>=0.15.0 <0.16.0')).toBe(true)
    expect(withinRange('^0.15.1', '>=0.15.0 <0.15.5')).toBe(false)
  })
})
