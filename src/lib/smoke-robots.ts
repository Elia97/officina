import type { CheckResult, SmokeContext } from './smoke-production.ts'

type Addresses = Pick<SmokeContext, 'baseUrl' | 'siteUrl'>

// La regola `has: host` del vercel.json dei progetti mette noindex su ogni `*.vercel.app`:
// lì deve esserci, e sul dominio vero toglierebbe il sito dagli indici senza nessun errore.
const onVercel = ({ baseUrl, siteUrl }: Addresses): boolean => {
  const { hostname } = new URL(baseUrl)
  return hostname !== URL.parse(siteUrl)?.hostname && hostname.endsWith('.vercel.app')
}

const OUT_OF_INDEX = new Set(['noindex', 'none'])

const keepsOutOfIndex = (robots: string): boolean =>
  robots.split(',').some((directive) => OUT_OF_INDEX.has(directive.trim().toLowerCase()))

export function checkRobotsTag(addresses: Addresses, url: string, robots: string | null): CheckResult {
  if (!onVercel(addresses)) {
    const check = 'nessun x-robots-tag sull’host di produzione'
    if (robots === null) return { check, status: 'pass' }
    return { check, status: 'fail', detail: `presente su ${url}: "${robots}"` }
  }
  const check = 'x-robots-tag noindex sull’indirizzo di Vercel'
  if (robots === null) return { check, status: 'fail', detail: `assente su ${url}` }
  if (keepsOutOfIndex(robots)) return { check, status: 'pass' }
  return { check, status: 'fail', detail: `senza noindex su ${url}: "${robots}"` }
}
