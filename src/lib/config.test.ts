import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { defineConfig, findConfigFile, isRequired, loadConfig } from './config.ts'

const roots: string[] = []

function project(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-config-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) writeFileSync(join(root, name), source)
  return root
}

const config = (body: string) => project({ 'officina.config.mjs': `export default ${body}\n` })

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('loadConfig', () => {
  it('senza file di configurazione restituisce un oggetto vuoto: valgono i default del pacchetto', async () => {
    expect(await loadConfig(project())).toEqual({})
  })

  it('legge il default export del file del progetto', async () => {
    expect(await loadConfig(config("{ siteUrl: 'https://prova.test' }"))).toEqual({ siteUrl: 'https://prova.test' })
  })

  it('accetta le voci nuove: i controlli che il progetto pretende e i rappresentanti delle rotte', async () => {
    const source =
      "{ features: { analytics: false, roadmap: 'required' }, routes: { representatives: { '/blog/[slug]': '/blog/ciao' } } }"

    expect(await loadConfig(config(source))).toMatchObject({ features: { analytics: false } })
  })

  it('un file senza default export è un errore, non una configurazione vuota', async () => {
    const root = project({ 'officina.config.mjs': 'export const unused = 1\n' })

    await expect(loadConfig(root)).rejects.toThrow(/non ha un default export/)
  })

  it('due file insieme sono un errore: quale valga non lo decide officina', async () => {
    const root = project({ 'officina.config.ts': 'export default {}\n', 'officina.config.mjs': 'export default {}\n' })

    await expect(loadConfig(root)).rejects.toThrow(
      'officina.config.ts e officina.config.mjs stanno insieme nella radice',
    )
  })
})

describe('la configurazione validata', () => {
  it('nomina il percorso della voce sbagliata, non che la configurazione non va', async () => {
    await expect(loadConfig(config("{ bundle: { cssMaxGzip: '14kb' } }"))).rejects.toThrow(
      'bundle.cssMaxGzip: atteso un numero, ricevuto una stringa',
    )
  })

  it('scende dentro liste e dizionari', async () => {
    await expect(loadConfig(config('{ smoke: { checks: [1] } }'))).rejects.toThrow(
      'smoke.checks[0]: atteso una funzione, ricevuto un numero',
    )
    await expect(loadConfig(config("{ routes: { representatives: { '/blog/[slug]': 1 } } }"))).rejects.toThrow(
      'routes.representatives./blog/[slug]: atteso una stringa, ricevuto un numero',
    )
  })

  it('rifiuta un controllo dichiarato con qualcosa che non è `required` né false', async () => {
    await expect(loadConfig(config('{ features: { roadmap: true } }'))).rejects.toThrow(
      "features.roadmap: atteso 'required' oppure false, ricevuto un booleano",
    )
  })

  it('rifiuta una voce sconosciuta: un refuso non deve passare in silenzio', async () => {
    await expect(loadConfig(config("{ sitUrl: 'https://prova.test' }"))).rejects.toThrow('sitUrl: voce sconosciuta')
  })

  it('elenca tutti i problemi in una volta', async () => {
    await expect(loadConfig(config('{ siteUrl: 1, icons: { background: 2 } }'))).rejects.toThrow(
      'siteUrl: atteso una stringa, ricevuto un numero; icons.background: atteso una stringa, ricevuto un numero',
    )
  })
})

describe('findConfigFile', () => {
  it('dice quale file del progetto verrà caricato, o che non ce n’è nessuno', () => {
    const root = config('{}')

    expect(findConfigFile(root)).toBe(join(root, 'officina.config.mjs'))
    expect(findConfigFile(join(root, 'altrove'))).toBeUndefined()
  })
})

describe('isRequired', () => {
  it('il silenzio vale `required`: un controllo si spegne dichiarandolo', () => {
    expect(isRequired({}, 'roadmap')).toBe(true)
    expect(isRequired({ features: {} }, 'analytics')).toBe(true)
    expect(isRequired({ features: { analytics: 'required' } }, 'analytics')).toBe(true)
    expect(isRequired({ features: { analytics: false } }, 'analytics')).toBe(false)
  })
})

describe('defineConfig', () => {
  it('restituisce la configurazione così com’è: serve solo a darle un tipo', () => {
    const value = { siteUrl: 'https://prova.test' }

    expect(defineConfig(value)).toBe(value)
  })
})
