// I pezzi con cui un progetto compone i propri controlli di smoke: `smoke.checks` sostituisce la
// lista del pacchetto, quindi chi ne toglie uno ricompone la lista da qui.
export { NON_HTML_ROUTES } from './lib/routes.ts'
export {
  checkBotIdChallenge,
  checkCanonicalHost,
  checkPages,
  checkSecurityHeaders,
  checkTrailingSlash,
  DEFAULT_CHECKS,
  SECURITY_HEADERS,
} from './lib/smoke-production.ts'
