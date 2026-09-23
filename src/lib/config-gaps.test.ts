import { describe, expect, it } from 'vitest'

import type { OfficinaConfig } from './config.ts'
import { configGaps } from './config-gaps.ts'

const messages = (gaps: { message: string }[]) => gaps.map(({ message }) => message)

const complete: OfficinaConfig = {
  siteUrl: 'https://prova.test',
  icons: { background: '#fafafa' },
  features: { analytics: 'required', roadmap: false, generators: 'required', botId: 'required' },
}

describe('configGaps', () => {
  it('non trova niente in una configurazione che dichiara URL, icone e controlli', () => {
    expect(configGaps(complete)).toEqual([])
  })

  it('distingue il file che manca da quello che non si carica', () => {
    expect(messages(configGaps(undefined))).toEqual(['manca: i valori del progetto per officina stanno qui'])
    expect(messages(configGaps(new Error("Cannot find module '@/lib/site'")))).toEqual([
      "non si carica: Cannot find module '@/lib/site'",
    ])
  })

  it('nomina le voci che i comandi pretendono, controlli compresi', () => {
    expect(messages(configGaps({}))).toEqual([
      '`siteUrl` assente: `check smoke` non ha un host canonico',
      '`icons.background` assente: `gen icons` non ha un colore di fondo',
      "`features.analytics` non dichiarata: vale `'required'`, e il gate fallisce se non trova cosa controllare",
      "`features.roadmap` non dichiarata: vale `'required'`, e il gate fallisce se non trova cosa controllare",
      "`features.generators` non dichiarata: vale `'required'`, e il gate fallisce se non trova cosa controllare",
      "`features.botId` non dichiarata: vale `'required'`, e il gate fallisce se non trova cosa controllare",
    ])
  })

  it('boccia un siteUrl che non è un URL, o che porta la barra finale', () => {
    const rest = {
      icons: { background: '#fafafa' },
      features: { analytics: 'required', roadmap: false, generators: false, botId: false },
    } as const

    expect(messages(configGaps({ siteUrl: 'prova.test', ...rest }))).toEqual(['`siteUrl` non è un URL: `prova.test`'])
    expect(messages(configGaps({ siteUrl: 'https://prova.test/', ...rest }))).toEqual([
      '`siteUrl` finisce con una barra: `https://prova.test/`',
    ])
  })

  it('nomina il pattern dinamico che nessuno va a visitare', () => {
    expect(messages(configGaps(complete, ['/blog/[slug]', '/tag/[tag]']))).toEqual([
      '`routes.representatives` non ha un percorso per `/blog/[slug]`: smoke e Lighthouse non guardano quella pagina',
      '`routes.representatives` non ha un percorso per `/tag/[tag]`: smoke e Lighthouse non guardano quella pagina',
    ])
  })
})
