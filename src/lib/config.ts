import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Budget } from './bundle-budget.ts'
import type { Representatives, VerifiedRoute } from './routes.ts'
import type { SmokeCheck } from './smoke-production.ts'
import { aFunction, aNumber, anArrayOf, aRecordOf, aShape, aString, aStringOrNull, oneOf } from './validate.ts'

/** `'required'` fa fallire il gate quando ciò che deve controllare non c'è; `false` lo spegne. */
export type FeatureSetting = 'required' | false

export interface OfficinaConfig {
  /** L'apice di produzione, senza barra finale: lo usa `check smoke` quando non riceve un URL. */
  siteUrl?: string
  icons?: { background: string }
  bundle?: { budgets?: readonly Budget[]; cssMaxGzip?: number }
  smoke?: {
    securityHeaders?: Record<string, string | null>
    nonHtmlRoutes?: readonly VerifiedRoute[]
    checks?: readonly SmokeCheck[]
  }
  analytics?: { linkTracking?: string }
  /** Quali controlli il progetto pretende. Una voce non dichiarata vale `'required'`. */
  features?: { analytics?: FeatureSetting; roadmap?: FeatureSetting }
  /** Per ogni pattern dinamico di `src/pages`, un percorso vero che smoke e Lighthouse visitano. */
  routes?: { representatives?: Representatives }
}

export const FEATURES = ['analytics', 'roadmap'] as const
export type FeatureName = (typeof FEATURES)[number]

/** Un controllo si spegne solo scrivendolo: il silenzio vale `'required'`. */
export const isRequired = (config: OfficinaConfig, name: FeatureName): boolean =>
  (config.features?.[name] ?? 'required') === 'required'

const budget = aShape({ label: aString, matches: aFunction, maxGzip: aNumber })
const verifiedRoute = aShape({ path: aString, type: aString })
const feature = oneOf("'required' oppure false", ['required', false])

const SHAPE = aShape({
  siteUrl: aString,
  icons: aShape({ background: aString }),
  bundle: aShape({ budgets: anArrayOf(budget), cssMaxGzip: aNumber }),
  smoke: aShape({
    securityHeaders: aRecordOf(aStringOrNull),
    nonHtmlRoutes: anArrayOf(verifiedRoute),
    checks: anArrayOf(aFunction),
  }),
  analytics: aShape({ linkTracking: aString }),
  features: aShape({ analytics: feature, roadmap: feature }),
  routes: aShape({ representatives: aRecordOf(aString) }),
})

const CONFIG_FILES: readonly string[] = ['officina.config.ts', 'officina.config.mjs', 'officina.config.js']

export const defineConfig = (config: OfficinaConfig): OfficinaConfig => config

// Fuori da node_modules Node toglie i tipi da solo: il file del progetto può essere TypeScript.
const findConfigFiles = (root: string): string[] =>
  CONFIG_FILES.map((name) => join(root, name)).filter((path) => existsSync(path))

export const findConfigFile = (root: string): string | undefined => findConfigFiles(root)[0]

export async function loadConfig(root: string): Promise<OfficinaConfig> {
  const [file, ...rest] = findConfigFiles(root)
  if (file === undefined) return {}
  if (rest.length > 0) {
    const names = [file, ...rest].map((path) => basename(path)).join(' e ')
    throw new Error(`${names} stanno insieme nella radice: quale valga non lo decide officina, tienine uno`)
  }
  const name = basename(file)
  const module: { default?: unknown } = await import(pathToFileURL(file).href)
  if (module.default === undefined) {
    throw new Error(
      `${name} non ha un default export: la configurazione si scrive \`export default defineConfig({ … })\``,
    )
  }
  const problems = SHAPE(module.default, '')
  if (problems.length > 0) throw new Error(problems.join('; '))
  return module.default as OfficinaConfig
}
