import { afterEach, describe, expect, it } from 'vitest'
import { assertDictionaries, assertStringsInjectable, injectStrings } from './inject-strings.mjs'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

const IT = 'src/i18n/strings/it.ts'
const EN = 'src/i18n/strings/en.ts'
const KEYS = ['page.aboutUs.title', 'page.aboutUs.description']

const assertOn = (overrides: Record<string, string | null>) => () =>
  assertStringsInjectable({ root: makeRoot(overrides), keys: KEYS })

afterEach(cleanupRoots)

describe('il contratto dei dizionari', () => {
  it('passa sul dizionario vero, che è il contratto', () => {
    expect(assertOn({})).not.toThrow()
  })

  it("si ferma quando non c'è nessun dizionario", () => {
    expect(assertOn({ [IT]: null })).toThrow(/no dictionary/)
  })

  it('si ferma quando il file non dichiara la costante della sua lingua', () => {
    expect(assertOn({ [IT]: 'export const strings = {} as const\n' })).toThrow(/no `it` constant/)
  })

  it('si ferma quando la costante non è esportata', () => {
    expect(assertOn({ [IT]: 'const it = {} as const\n' })).toThrow(/not exported/)
  })

  it('si ferma quando la costante non è un letterale as const', () => {
    expect(assertOn({ [IT]: 'export const it = {}\n' })).toThrow(/not an object literal/)
  })

  it('si ferma su una chiave che un dizionario ha già', () => {
    const en = "export const en = { 'page.aboutUs.title': 'About us' } as const\n"

    expect(assertOn({ [EN]: en })).toThrow(/already there/)
  })
})

describe('assertDictionaries', () => {
  it('guarda la forma dei dizionari senza sapere quali chiavi arriveranno', () => {
    expect(() => assertDictionaries({ root: makeRoot() })).not.toThrow()
  })

  it('si ferma sulla stessa cosa del pre-volo, la costante che non è un letterale as const', () => {
    const root = makeRoot({ [IT]: 'export const it = {}\n' })

    expect(() => assertDictionaries({ root })).toThrow(/not an object literal/)
  })

  it('non guarda le chiavi: una che il pre-volo rifiuterebbe qui passa', () => {
    const it = "export const it = { 'page.aboutUs.title': 'Chi siamo' } as const\n"
    const root = makeRoot({ [IT]: it })

    expect(() => assertDictionaries({ root })).not.toThrow()
    expect(() => assertStringsInjectable({ root, keys: KEYS })).toThrow(/already there/)
  })
})

describe('injectStrings', () => {
  it('scrive le chiavi in ogni dizionario registrato', () => {
    const root = makeRoot({ [EN]: "export const en = {\n  'nav.home': 'Home',\n} as const\n" })

    injectStrings({ root, entries: [{ key: 'page.aboutUs.title', value: 'About us' }] })

    for (const dictionary of [IT, EN]) {
      expect(read(root, dictionary)).toContain("'page.aboutUs.title': 'About us'")
    }
  })
})
