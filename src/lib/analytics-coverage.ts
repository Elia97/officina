import type { Trigger } from './gtm-container.ts'

export type LinkEvent = { prefix: string; event: string }

export type Coverage = { event: string; prefix: string; covered: boolean }

const LINK_EVENT = /startsWith\('([^']+)'\)\)\s*return\s*'([^']+)'/g

// Letto dal sorgente di src/lib/analytics/link-tracking.ts invece di essere riscritto qui: le
// due liste divergono il giorno in cui qualcuno aggiunge uno schema, e non fallirebbe niente.
export function extractLinkEvents(source: string): LinkEvent[] {
  return [...source.matchAll(LINK_EVENT)].map(([, prefix, event]) => ({
    /* v8 ignore start -- i due gruppi di LINK_EVENT sono obbligatori: il ripiego serve solo ai tipi */
    prefix: prefix ?? '',
    event: event ?? '',
    /* v8 ignore stop */
  }))
}

export function coverageOf(events: readonly LinkEvent[], triggers: readonly Trigger[]): Coverage[] {
  const fired = new Set(triggers.map(({ eventName }) => eventName))
  return events.map(({ event, prefix }) => ({ event, prefix, covered: fired.has(event) }))
}
