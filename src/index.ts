// Ciò che un progetto importa nel proprio officina.config.ts: il tipo della configurazione e i
// pezzi del motore con cui comporre budget e controlli di smoke propri.
export type { Budget } from './lib/bundle-budget.ts'
export { CSS_BUDGET_GZIP } from './lib/bundle-budget.ts'
export type { OfficinaConfig } from './lib/config.ts'
export { defineConfig } from './lib/config.ts'
export type { IconSpec } from './lib/icon-specs.ts'
export { ICON_SPECS } from './lib/icon-specs.ts'
export type { VerifiedRoute } from './lib/routes.ts'
export { NON_HTML_ROUTES } from './lib/routes.ts'
export type { CheckResult, SmokeCheck, SmokeContext } from './lib/smoke-production.ts'
export {
  checkBotIdChallenge,
  checkCanonicalHost,
  checkPages,
  checkSecurityHeaders,
  checkTrailingSlash,
  DEFAULT_CHECKS,
  SECURITY_HEADERS,
} from './lib/smoke-production.ts'
