import { FEATURES, type OfficinaConfig } from './config.ts'
import type { ContractGap } from './contract.ts'

const CONFIG = 'officina.config.ts'

const asGap = (message: string): ContractGap => ({ path: CONFIG, message })

function siteUrlGap(siteUrl: string | undefined): string | undefined {
  if (siteUrl === undefined) return '`siteUrl` assente: `check smoke` non ha un host canonico'
  if (!URL.canParse(siteUrl)) return `\`siteUrl\` non è un URL: \`${siteUrl}\``
  return siteUrl.endsWith('/') ? `\`siteUrl\` finisce con una barra: \`${siteUrl}\`` : undefined
}

// Il silenzio vale `'required'`: un controllo si spegne dichiarandolo, non dimenticandolo.
const featureGaps = (config: OfficinaConfig): ContractGap[] =>
  FEATURES.filter((name) => config.features?.[name] === undefined).map((name) =>
    asGap(`\`features.${name}\` non dichiarata: vale \`'required'\`, e il gate fallisce se non trova cosa controllare`),
  )

const representativeGaps = (patterns: readonly string[]): string[] =>
  patterns.map(
    (label) =>
      `\`routes.representatives\` non ha un percorso per \`${label}\`: smoke e Lighthouse non guardano quella pagina`,
  )

const disabledGaps = (labels: readonly string[]): string[] =>
  labels.map(
    (label) =>
      `\`routes.disabled\` nomina \`${label}\`, che non è una pagina dinamica prerenderizzata di \`src/pages\`: non spegne niente`,
  )

export type RouteGaps = { missingRepresentatives?: readonly string[]; unknownDisabled?: readonly string[] }

export function configGaps(
  loaded: OfficinaConfig | Error | undefined,
  { missingRepresentatives = [], unknownDisabled = [] }: RouteGaps = {},
): ContractGap[] {
  if (loaded === undefined) return [{ path: CONFIG, message: 'manca: i valori del progetto per officina stanno qui' }]
  if (loaded instanceof Error) return [{ path: CONFIG, message: `non si carica: ${loaded.message}` }]
  const messages = [
    siteUrlGap(loaded.siteUrl),
    loaded.icons === undefined ? '`icons.background` assente: `gen icons` non ha un colore di fondo' : undefined,
  ].filter((message) => message !== undefined)
  return [
    ...messages.map(asGap),
    ...featureGaps(loaded),
    ...representativeGaps(missingRepresentatives).map(asGap),
    ...disabledGaps(unknownDisabled).map(asGap),
  ]
}
