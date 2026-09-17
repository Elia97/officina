import { describe, expect, it } from 'vitest'

import {
  aFunction,
  aNumber,
  anArrayOf,
  aRecordOf,
  aShape,
  aString,
  aStringOrNull,
  oneOf,
  problem,
  typeName,
} from './validate.ts'

describe('typeName', () => {
  it.each([
    [null, 'null'],
    [[], 'un array'],
    ['x', 'una stringa'],
    [1, 'un numero'],
    [true, 'un booleano'],
    [() => 0, 'una funzione'],
    [undefined, 'niente'],
    [{}, 'un oggetto'],
  ])('chiama %s per nome', (value, name) => {
    expect(typeName(value)).toBe(name)
  })
})

describe('i controlli semplici', () => {
  it('dicono il percorso della voce sbagliata, non che la configurazione non va', () => {
    expect(problem('bundle.cssMaxGzip', 'un numero', 'tanto')).toBe(
      'bundle.cssMaxGzip: atteso un numero, ricevuto una stringa',
    )
  })

  it('accettano il tipo giusto e nominano quello ricevuto', () => {
    expect(aString('x', 'a')).toEqual([])
    expect(aString(1, 'a')).toEqual(['a: atteso una stringa, ricevuto un numero'])
    expect(aNumber(1, 'a')).toEqual([])
    expect(aNumber('1', 'a')).toEqual(['a: atteso un numero, ricevuto una stringa'])
    expect(aFunction(() => 0, 'a')).toEqual([])
    expect(aFunction(0, 'a')).toEqual(['a: atteso una funzione, ricevuto un numero'])
  })

  it('lasciano passare null dove il contratto lo prevede', () => {
    expect(aStringOrNull(null, 'a')).toEqual([])
    expect(aStringOrNull('x', 'a')).toEqual([])
    expect(aStringOrNull(1, 'a')).toEqual(['a: atteso una stringa oppure null, ricevuto un numero'])
  })

  it('elencano i valori ammessi quando sono pochi e fissi', () => {
    const feature = oneOf("'required' oppure false", ['required', false])

    expect(feature(false, 'features.roadmap')).toEqual([])
    expect(feature('no', 'features.roadmap')).toEqual([
      "features.roadmap: atteso 'required' oppure false, ricevuto una stringa",
    ])
  })
})

describe('i controlli composti', () => {
  it('numerano la voce sbagliata dentro un array', () => {
    expect(anArrayOf(aString)(['a', 2], 'smoke.checks')).toEqual([
      'smoke.checks[1]: atteso una stringa, ricevuto un numero',
    ])
    expect(anArrayOf(aString)('a', 'smoke.checks')).toEqual(['smoke.checks: atteso un array, ricevuto una stringa'])
  })

  it('nominano la chiave sbagliata dentro un dizionario', () => {
    expect(aRecordOf(aString)({ a: 'x', b: 2 }, 'routes')).toEqual(['routes.b: atteso una stringa, ricevuto un numero'])
    expect(aRecordOf(aString)([], 'routes')).toEqual(['routes: atteso un oggetto, ricevuto un array'])
  })

  it('percorrono un oggetto voce per voce, e ignorano quelle non scritte', () => {
    const shape = aShape({ url: aString, max: aNumber })

    expect(shape({ url: 'https://prova.test' }, '')).toEqual([])
    expect(shape({ max: 'tanto' }, 'bundle')).toEqual(['bundle.max: atteso un numero, ricevuto una stringa'])
    expect(shape(undefined, 'bundle')).toEqual(['bundle: atteso un oggetto, ricevuto niente'])
  })

  it('una voce sconosciuta è un errore: `sitUrl` non deve passare in silenzio', () => {
    expect(aShape({ siteUrl: aString })({ sitUrl: 'https://prova.test' }, '')).toEqual(['sitUrl: voce sconosciuta'])
    expect(aShape({ a: aString })({ b: 1 }, 'smoke')).toEqual(['smoke.b: voce sconosciuta'])
  })

  it('una voce scritta a undefined vale come non scritta', () => {
    expect(aShape({ siteUrl: aString })({ siteUrl: undefined }, '')).toEqual([])
  })
})
