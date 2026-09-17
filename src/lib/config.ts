import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import type { Budget } from './bundle-budget.ts'
import type { VerifiedRoute } from './routes.ts'
import type { SmokeCheck } from './smoke-production.ts'

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
}

const CONFIG_FILES: readonly string[] = ['officina.config.ts', 'officina.config.mjs', 'officina.config.js']

export const defineConfig = (config: OfficinaConfig): OfficinaConfig => config

// Fuori da node_modules Node toglie i tipi da solo: il file del progetto può essere TypeScript.
export async function loadConfig(root: string): Promise<OfficinaConfig> {
  const file = CONFIG_FILES.map((name) => join(root, name)).find((path) => existsSync(path))
  if (file === undefined) return {}
  const module: { default?: OfficinaConfig } = await import(pathToFileURL(file).href)
  return module.default ?? {}
}
