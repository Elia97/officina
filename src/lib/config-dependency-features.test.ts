import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { featuresOffByChoice, featuresOn, isOn, loadConfig, migrationUrlKey, type OfficinaConfig } from './config.ts'

const roots: string[] = []

function config(body: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-config-dipendenze-'))
  roots.push(root)
  writeFileSync(join(root, 'officina.config.mjs'), `export default ${body}\n`)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const drizzle = { dependencies: { 'drizzle-orm': '^0.45.2' } }
const both = { dependencies: { 'drizzle-orm': '^0.45.2' }, devDependencies: { 'better-auth': '^1.7.3' } }

describe('features.database, features.auth e database.migrationUrlKey', () => {
  it('si leggono come le altre voci', async () => {
    const declared = "{ features: { database: false, auth: 'required' }, database: { migrationUrlKey: 'DIRECT_URL' } }"

    expect(await loadConfig(config(declared))).toEqual({
      features: { database: false, auth: 'required' },
      database: { migrationUrlKey: 'DIRECT_URL' },
    })
  })

  it('rifiutano un valore sbagliato nominando la voce', async () => {
    await expect(
      loadConfig(config('{ features: { database: true }, database: { migrationUrlKey: 42 } }')),
    ).rejects.toThrow(
      "features.database: atteso 'required' oppure false, ricevuto un booleano; database.migrationUrlKey: atteso una stringa, ricevuto un numero",
    )
  })
})

describe('isOn', () => {
  it('senza dichiarazione segue la libreria, fra le dipendenze o fra quelle di sviluppo', () => {
    expect(isOn({}, {}, 'database')).toBe(false)
    expect(isOn({}, drizzle, 'database')).toBe(true)
    expect(isOn({}, drizzle, 'auth')).toBe(false)
    expect(isOn({}, both, 'auth')).toBe(true)
  })

  it('non si rompe su dipendenze che non sono un oggetto: non dichiarano niente', () => {
    expect(isOn({}, { dependencies: null, devDependencies: 'drizzle-orm' } as never, 'database')).toBe(false)
  })

  it('dichiarata vale la dichiarazione: false spegne anche con la libreria, required accende anche senza', () => {
    expect(isOn({ features: { database: false } }, drizzle, 'database')).toBe(false)
    expect(isOn({ features: { auth: 'required' } }, {}, 'auth')).toBe(true)
  })
})

describe('featuresOn e featuresOffByChoice', () => {
  it("separano le feature accese da quelle spente per scelta mentre la libreria c'è", () => {
    const off: OfficinaConfig = { features: { database: false, auth: false } }

    expect(featuresOn({}, both)).toEqual(['database', 'auth'])
    expect(featuresOffByChoice({}, both)).toEqual([])
    expect(featuresOn(off, drizzle)).toEqual([])
    expect(featuresOffByChoice(off, drizzle)).toEqual(['database'])
  })
})

describe('migrationUrlKey', () => {
  it('senza dichiarazione è DATABASE_URL_UNPOOLED', () => {
    expect(migrationUrlKey({})).toBe('DATABASE_URL_UNPOOLED')
    expect(migrationUrlKey({ database: { migrationUrlKey: 'DIRECT_URL' } })).toBe('DIRECT_URL')
  })
})
