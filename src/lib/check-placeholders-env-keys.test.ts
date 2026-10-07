import { describe, expect, it } from 'vitest'

import { requiredEnvKeys } from './check-placeholders.ts'

const CONTACT = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME', 'CONTACT_TO_EMAIL']
const BOTH = { dependencies: { 'drizzle-orm': '^0.45.2', 'better-auth': '^1.7.3' } }

describe('requiredEnvKeys', () => {
  it('senza database né autenticazione sono le chiavi dei contatti', () => {
    expect(requiredEnvKeys({}, {})).toEqual(CONTACT)
  })

  it('con le due librerie aggiunge le loro chiavi, non quella delle migrazioni, che al deploy arriva da GitHub', () => {
    expect(requiredEnvKeys({ database: { migrationUrlKey: 'MIGRATION_URL' } }, BOTH)).toEqual([
      ...CONTACT,
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
    ])
  })

  it('una feature spenta non pretende le sue chiavi', () => {
    expect(requiredEnvKeys({ features: { database: false } }, BOTH)).toEqual([...CONTACT, 'BETTER_AUTH_SECRET'])
  })

  it('una chiave dei contatti uguale a quella di una feature non si chiede due volte', () => {
    expect(requiredEnvKeys({ placeholders: { contactEnvKeys: ['DATABASE_URL'] } }, BOTH)).toEqual([
      'DATABASE_URL',
      'BETTER_AUTH_SECRET',
    ])
  })
})
