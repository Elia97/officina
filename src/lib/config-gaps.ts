import { FEATURES, type OfficinaConfig } from './config.ts'
import type { ContractGap } from './contract.ts'

const CONFIG = 'officina.config.ts'

function siteUrlGap(siteUrl: string | undefined): string | undefined {
  if (siteUrl === undefined) return '`siteUrl` assente: `check smoke` non ha un host canonico'
  if (!URL.canParse(siteUrl)) return `\`siteUrl\` non è un URL: \`${siteUrl}\``
  return siteUrl.endsWith('/') ? `\`siteUrl\` finisce con una barra: \`${siteUrl}\`` : undefined
}

// Il silenzio vale `'required'`: un controllo si spegne dichiarandolo, non dimenticandolo.
const featureGaps = (config: OfficinaConfig): string[] =>
  FEATURES.filter((name) => config.features?.[name] === undefined).map(
    (name) =>
      `\`features.${name}\` non dichiarata: vale \`'required'\`, e il gate fallisce se non trova cosa controllare`,
  )

const representativeGaps = (patterns: readonly string[]): string[] =>
  patterns.map(
    (label) =>
      `\`routes.representatives\` non ha un percorso per \`${label}\`: smoke e Lighthouse non guardano quella pagina`,
  )

/**
 * `loaded` è la configurazione letta, l'errore che il suo caricamento ha sollevato, o `undefined` se
 * il file non c'è; `patterns` i pattern dinamici di `src/pages` rimasti senza rappresentante.
 */
export function configGaps(
  loaded: OfficinaConfig | Error | undefined,
  patterns: readonly string[] = [],
): ContractGap[] {
  if (loaded === undefined) return [{ path: CONFIG, message: 'manca: i valori del progetto per officina stanno qui' }]
  if (loaded instanceof Error) return [{ path: CONFIG, message: `non si carica: ${loaded.message}` }]
  const messages = [
    siteUrlGap(loaded.siteUrl),
    loaded.icons === undefined ? '`icons.background` assente: `gen icons` non ha un colore di fondo' : undefined,
    ...featureGaps(loaded),
    ...representativeGaps(patterns),
  ]
  return messages.filter((message) => message !== undefined).map((message) => ({ path: CONFIG, message }))
}
