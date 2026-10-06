import { describe, expect, it } from 'vitest'

import { requiredEnvKeys } from './check-placeholders.ts'

const CONTACT = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME', 'CONTACT_TO_EMAIL']
const BOTH = { dependencies: { 'drizzle-orm': '^0.45.2', 'better-auth': '^1.7.3' } }

describe('requiredEnvKeys', () => {
  it('senza database né autenticazione sono le chiavi dei contatti', () => {
    expect(requiredEnvKeys({}, {})).toEqual(CONTACT)
  })

  it('con le due librerie aggiunge le loro chiavi e quella delle migrazioni', () => {
    expect(requiredEnvKeys({}, BOTH)).toEqual([
      ...CONTACT,
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
      'DATABASE_URL_UNPOOLED',
    ])
  })

  it('una feature spenta non pretende le sue chiavi', () => {
    expect(requiredEnvKeys({ features: { database: false } }, BOTH)).toEqual([...CONTACT, 'BETTER_AUTH_SECRET'])
  })

  it('una chiave delle migrazioni uguale a DATABASE_URL non si chiede due volte', () => {
    expect(requiredEnvKeys({ database: { migrationUrlKey: 'DATABASE_URL' } }, BOTH)).toEqual([
      ...CONTACT,
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
    ])
  })
})
