// Ciò che un progetto importa nel proprio officina.config.ts: la funzione che dà un tipo alla
// configurazione, e i tipi con cui scriverla. I pezzi del motore stanno nei sottopercorsi
// `@elia97/officina/smoke`, `/bundle` e `/icons`: la radice resta la sola cosa che un progetto
// deve conoscere per configurarsi.
export type { Budget } from './lib/bundle-budget.ts'
export type { OfficinaConfig } from './lib/config.ts'
export { defineConfig } from './lib/config.ts'
export type { IconSpec } from './lib/icon-specs.ts'
export type { VerifiedRoute } from './lib/routes.ts'
export type { CheckResult, SmokeCheck, SmokeContext } from './lib/smoke-production.ts'
