import { existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Manifest } from './alignment.ts'
import type { Budget } from './bundle-budget.ts'
import type { Representatives, VerifiedRoute } from './routes.ts'
import type { SmokeCheck } from './smoke-production.ts'
import {
  aFunction,
  aNumber,
  anArrayOf,
  aRecordOf,
  aShape,
  aString,
  aStringOrNull,
  isRecord,
  oneOf,
} from './validate.ts'

/** `'required'` fa fallire il gate quando ciò che deve controllare non c'è; `false` lo spegne. */
export type FeatureSetting = 'required' | false

export type GeneratorsSetting = FeatureSetting | 'project'

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
  /**
   * Quali controlli il progetto pretende. Una voce non dichiarata vale `'required'`, tranne `database`
   * e `auth`, che senza dichiarazione seguono le dipendenze di `package.json`.
   */
  features?: {
    analytics?: FeatureSetting
    roadmap?: FeatureSetting
    generators?: GeneratorsSetting
    botId?: FeatureSetting
    links?: FeatureSetting
    database?: FeatureSetting
    auth?: FeatureSetting
  }
  placeholders?: { sources?: readonly string[]; contactEnvKeys?: readonly string[] }
  /** La variabile con cui girano le migrazioni; senza dichiarazione, `DATABASE_URL_UNPOOLED`. */
  database?: { migrationUrlKey?: string }
  routes?: {
    /** Per ogni pattern dinamico di `src/pages`, un percorso vero che smoke e Lighthouse visitano. */
    representatives?: Representatives
    /** I pattern dinamici di `src/pages` spenti per scelta: non emettono pagine, e nessun gate le pretende. */
    disabled?: readonly string[]
  }
}

export const FEATURES = ['analytics', 'roadmap', 'generators', 'botId', 'links'] as const
export type FeatureName = (typeof FEATURES)[number]

/** Un controllo si spegne solo scrivendolo: il silenzio vale `'required'`. */
export const isRequired = (config: OfficinaConfig, name: FeatureName): boolean =>
  (config.features?.[name] ?? 'required') === 'required'

export const generatorsSetting = (config: OfficinaConfig): GeneratorsSetting =>
  config.features?.generators ?? 'required'

export const DEPENDENCY_FEATURES = {
  database: { dependency: 'drizzle-orm', secret: 'DATABASE_URL' },
  auth: { dependency: 'better-auth', secret: 'BETTER_AUTH_SECRET' },
} as const

export type DependencyFeature = keyof typeof DEPENDENCY_FEATURES

const DEPENDENCY_FEATURE_NAMES = Object.keys(DEPENDENCY_FEATURES) as DependencyFeature[]

const declares = (dependencies: unknown, name: string): boolean => isRecord(dependencies) && name in dependencies

const dependsOn = ({ dependencies, devDependencies }: Manifest, name: DependencyFeature): boolean => {
  const { dependency } = DEPENDENCY_FEATURES[name]
  return declares(dependencies, dependency) || declares(devDependencies, dependency)
}

export function isOn(config: OfficinaConfig, manifest: Manifest, name: DependencyFeature): boolean {
  const declared = config.features?.[name]
  return declared === undefined ? dependsOn(manifest, name) : declared === 'required'
}

export const featuresOn = (config: OfficinaConfig, manifest: Manifest): DependencyFeature[] =>
  DEPENDENCY_FEATURE_NAMES.filter((name) => isOn(config, manifest, name))

export const featuresOffByChoice = (config: OfficinaConfig, manifest: Manifest): DependencyFeature[] =>
  DEPENDENCY_FEATURE_NAMES.filter((name) => config.features?.[name] === false && dependsOn(manifest, name))

export const migrationUrlKey = (config: OfficinaConfig): string =>
  config.database?.migrationUrlKey ?? 'DATABASE_URL_UNPOOLED'

const budget = aShape({ label: aString, matches: aFunction, maxGzip: aNumber })
const verifiedRoute = aShape({ path: aString, type: aString })
const feature = oneOf("'required' oppure false", ['required', false])
const generators = oneOf("'required', 'project' oppure false", ['required', 'project', false])

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
  features: aShape({
    analytics: feature,
    roadmap: feature,
    generators,
    botId: feature,
    links: feature,
    database: feature,
    auth: feature,
  }),
  placeholders: aShape({ sources: anArrayOf(aString), contactEnvKeys: anArrayOf(aString) }),
  database: aShape({ migrationUrlKey: aString }),
  routes: aShape({ representatives: aRecordOf(aString), disabled: anArrayOf(aString) }),
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
