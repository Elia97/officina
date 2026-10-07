export { NON_HTML_ROUTES } from './lib/routes.ts'
export { checkOnDemandPages } from './lib/smoke-on-demand.ts'
export {
  checkBotIdChallenge,
  checkCanonicalHost,
  checkPages,
  checkSecurityHeaders,
  checkTrailingSlash,
  DEFAULT_CHECKS,
  SECURITY_HEADERS,
} from './lib/smoke-production.ts'
