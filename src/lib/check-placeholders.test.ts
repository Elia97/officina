import { describe, expect, it } from 'vitest'

import { useFixtureProject } from '../test-fixture.ts'
import { contactEnvKeys, envFindings, placeholderSources, sourceFindings } from './check-placeholders.ts'

useFixtureProject()

const DEFAULT_KEYS = contactEnvKeys()

describe('placeholderSources', () => {
  it('guarda site.ts, company.ts e ogni dizionario registrato', () => {
    expect(placeholderSources()).toEqual(['src/lib/site.ts', 'src/lib/company.ts', 'src/i18n/strings/it.ts'])
  })

  it('con sources dichiarato guarda quella lista e nessun altro file, dizionari compresi', () => {
    expect(placeholderSources({ placeholders: { sources: ['src/lib/site.ts'] } })).toEqual(['src/lib/site.ts'])
  })

  it('con sources vuoto non guarda niente: il progetto lo ha dichiarato', () => {
    expect(placeholderSources({ placeholders: { sources: [] } })).toEqual([])
  })
})

describe('contactEnvKeys', () => {
  it('senza dichiarazione sono le tre del template', () => {
    expect(contactEnvKeys({})).toEqual(['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME', 'CONTACT_TO_EMAIL'])
  })

  it('dichiarate, sostituiscono la lista del pacchetto', () => {
    const keys = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME']

    expect(contactEnvKeys({ placeholders: { contactEnvKeys: keys } })).toEqual(keys)
  })
})

describe('sourceFindings', () => {
  it.each([
    ["  name: '<PROJECT_NAME>',", 'segnaposto del template <PROJECT_NAME>'],
    ["  'seo.defaultOgImageAlt': '<OG_IMAGE_ALT>',", 'segnaposto del template <OG_IMAGE_ALT>'],
    ["  url: 'https://example.com',", 'dominio segnaposto example.com'],
    ['  email: "info@example.com",', 'dominio segnaposto example.com'],
    ["  phone: '+390000000000',", 'telefono segnaposto +390000000000'],
    ["  phoneDisplay: '+39 000 0000000',", 'telefono segnaposto +39 000 0000000'],
    ["    postalCode: '00000',", 'CAP segnaposto 00000'],
    ["  social: [{ label: 'LinkedIn', href: '#' }],", "profilo senza indirizzo: href: '#'"],
  ])('%s → %s', (line, message) => {
    expect(sourceFindings(`export const values = {\n${line}\n}\n`)).toEqual([{ line: 2, message }])
  })

  it('accetta i valori di un progetto vero, e non guarda i tipi', () => {
    const source = [
      "  name: 'Acme',",
      "  url: 'https://acme.test',",
      "  phone: '+390212345678',",
      "    postalCode: '20121',",
      "  social: [{ label: 'LinkedIn', href: 'https://www.linkedin.com/company/acme' }],",
      '  const keys: Array<UIKey> = []',
    ].join('\n')

    expect(sourceFindings(source)).toEqual([])
  })

  it('salta le righe di solo commento', () => {
    expect(sourceFindings("// url: 'https://example.com'\n/* '<NAME>' */\n * '<CITY>'\n")).toEqual([])
  })

  it('riporta ogni stringa segnaposto di una riga, con la stessa riga', () => {
    expect(sourceFindings("  street: '<STREET>', site: 'https://example.com',")).toEqual([
      { line: 1, message: 'segnaposto del template <STREET>' },
      { line: 1, message: 'dominio segnaposto example.com' },
    ])
  })
})

describe('envFindings', () => {
  const complete = [
    'CONTACT_FROM_EMAIL="hello@acme.test"',
    'CONTACT_FROM_NAME="Acme"',
    'CONTACT_TO_EMAIL="sales@acme.test"',
  ].join('\n')

  it('passa con le tre chiavi impostate su valori veri', () => {
    expect(envFindings(complete, DEFAULT_KEYS)).toEqual([])
  })

  it('segnala una chiave assente, che ricade sul default di astro.config.mjs', () => {
    expect(envFindings(complete.replace('CONTACT_TO_EMAIL="sales@acme.test"', ''), DEFAULT_KEYS)).toEqual([
      { message: 'CONTACT_TO_EMAIL non è impostata: vale il default di astro.config.mjs' },
    ])
  })

  it('segnala una chiave vuota con la sua riga', () => {
    expect(envFindings(complete.replace('"Acme"', '""'), DEFAULT_KEYS)).toEqual([
      { line: 2, message: 'CONTACT_FROM_NAME non è impostata: vale il default di astro.config.mjs' },
    ])
  })

  it.each([
    ['"Acme"', '"<PROJECT_NAME>"', { line: 2, message: 'CONTACT_FROM_NAME porta un segnaposto del template' }],
    [
      '"sales@acme.test"',
      '"info@example.com"',
      { line: 3, message: 'CONTACT_TO_EMAIL porta un segnaposto del template' },
    ],
  ])('segnala il segnaposto %s → %s senza stamparne il valore', (from, to, finding) => {
    expect(envFindings(complete.replace(from, to), DEFAULT_KEYS)).toEqual([finding])
  })

  it('non pretende una chiave che il progetto non ha dichiarato', () => {
    const keys = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME']

    expect(envFindings(complete.replace('CONTACT_TO_EMAIL="sales@acme.test"', ''), keys)).toEqual([])
  })
})
