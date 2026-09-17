import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defineConfig, loadConfig } from './config.ts'

const roots: string[] = []

function projectWith(name: string, source: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-config-'))
  roots.push(root)
  writeFileSync(join(root, name), source)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('senza file di configurazione restituisce un oggetto vuoto: valgono i default del pacchetto', async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-config-'))
    roots.push(root)

    expect(await loadConfig(root)).toEqual({})
  })

  it('legge il default export del file del progetto', async () => {
    const root = projectWith('officina.config.mjs', "export default { siteUrl: 'https://prova.test' }\n")

    expect(await loadConfig(root)).toEqual({ siteUrl: 'https://prova.test' })
  })

  it('tratta un file senza default export come una configurazione vuota', async () => {
    const root = projectWith('officina.config.mjs', 'export const unused = 1\n')

    expect(await loadConfig(root)).toEqual({})
  })
})

describe('defineConfig', () => {
  it('restituisce la configurazione così com’è: serve solo a darle un tipo', () => {
    const config = { siteUrl: 'https://prova.test' }

    expect(defineConfig(config)).toBe(config)
  })
})
