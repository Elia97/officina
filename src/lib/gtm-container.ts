// Lettore del gtm.js pubblico di un container GTM. Dati dentro, dati fuori: la fetch, il
// rapporto e il codice di uscita restano in scripts/verify-analytics-coverage.mjs.

// Solo i campi che questo lettore tocca, tutti facoltativi e tutti `unknown`: è JSON di
// terze parti, quindi ogni valore va comunque ristretto nel punto in cui si usa.
export type Macro = { function?: unknown; vtp_name?: unknown }

export type Tag = { function?: unknown; vtp_eventName?: unknown; vtp_tagId?: unknown }

export type Predicate = { function?: unknown; arg0?: unknown; arg1?: unknown }

export type ContainerResource = {
  macros: Macro[]
  tags: Tag[]
  predicates: Predicate[]
  rules: unknown[][]
}

/** Un tag evento GA4 e le condizioni che lo fanno scattare. `unsupported` porta quello che
 *  il lettore non sa interpretare, così un trigger saltato a metà non risulta mai compreso. */
export type Trigger = {
  eventName: string
  firesOn: string[]
  selectors: string[]
  urlContains: string[]
  unsupported: string[]
}

type Clause = { op: unknown; args: unknown[] }

// Tag evento GA4. Il tag Google vero e proprio (`__googtag`) configura la proprietà e scatta
// all'inizializzazione: non traccia nessuna superficie, quindi qui non è un trigger.
const GA4_EVENT_TAG = '__gaawe'

// Contabilità interna di GTM: ogni listener nativo scrive gli id dei trigger per cui è
// scattato, e il tag li rilegge con un `_re`. Da parte nostra non c'è niente da verificare.
const INTERNAL_VARIABLE = 'gtm.triggers'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : [])

const arrays = (value: unknown): unknown[][] => (Array.isArray(value) ? value.filter(Array.isArray) : [])

function matchingBrace(source: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < source.length; index++) {
    const char = source[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return index + 1
  }
  throw new Error('the container literal never closes — truncated download?')
}

/** Il container arriva come un solo file JS che contiene un unico letterale `var data = {…}`,
 *  e a isolarlo è solo un conteggio di graffe che conosce le stringhe: i valori ne contengono. */
export function parseContainerData(source: string): ContainerResource {
  const marker = source.indexOf('var data = {')
  if (marker === -1) throw new Error('no `var data = {` in the container — the reader is broken, not the container')

  const start = source.indexOf('{', marker)
  // La fetta comincia con una `{`, quindi JSON.parse o solleva un errore o restituisce un oggetto.
  const parsed = JSON.parse(source.slice(start, matchingBrace(source, start))) as { resource?: unknown }
  if (!isRecord(parsed.resource)) throw new Error('the container literal carries no `resource` — the reader is broken')

  const resource: { macros?: unknown; tags?: unknown; predicates?: unknown; rules?: unknown } = parsed.resource
  return {
    macros: records(resource.macros),
    tags: records(resource.tags),
    predicates: records(resource.predicates),
    rules: arrays(resource.rules),
  }
}

/** L'id del container come lo serve la produzione, incorporato con `define:vars`. Pubblico per
 *  costruzione, ed è l'unica risposta a "quale container gira su questo host". */
export function extractGtmId(html: string): string {
  const at = html.indexOf('__rsAnalyticsConfig')
  const block = at === -1 ? '' : html.slice(Math.max(0, html.lastIndexOf('<script', at)), at)
  const id = /gtmId\s*=\s*"([^"]+)"/.exec(block)?.[1]
  if (id === undefined) throw new Error('no GTM id in the served markup — tracking is off on this host')
  return id
}

/** Le proprietà GA4 che il container configura. Senza nemmeno una, ogni tag evento scatta nel
 *  vuoto: un elenco vuoto è un fallimento, non una nota. */
export function googleTagIds(container: ContainerResource): string[] {
  const ids = container.tags.filter((tag) => tag.function === '__googtag').map((tag) => tag.vtp_tagId)
  return [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
}

const macroIndex = (arg: unknown): number | null => {
  if (!Array.isArray(arg) || arg[0] !== 'macro') return null
  const index: unknown = arg[1]
  return typeof index === 'number' ? index : null
}

/** Cosa legge un predicato: `event` per il nome dell'evento dataLayer (`__e`), altrimenti il
 *  nome della variabile stessa (`gtm.element`, `gtm.elementUrl`, `gtm.triggers`). */
function macroKind(macros: Macro[], index: number | null): string | null {
  const macro = index === null ? undefined : macros[index]
  if (macro === undefined) return null
  if (macro.function === '__e') return 'event'
  const name = macro.vtp_name
  return typeof name === 'string' ? name : null
}

function applyPredicate(trigger: Trigger, container: ContainerResource, index: unknown): void {
  const predicate = typeof index === 'number' ? container.predicates[index] : undefined
  if (predicate === undefined) {
    trigger.unsupported.push(`predicate #${String(index)} does not exist`)
    return
  }

  const fn = predicate.function
  const kind = macroKind(container.macros, macroIndex(predicate.arg0))
  const value = predicate.arg1
  if (kind === INTERNAL_VARIABLE) return

  const label = `${String(fn)} on ${kind ?? 'an unreadable variable'}`
  if (fn === '_eq' && kind === 'event' && typeof value === 'string') trigger.firesOn.push(value)
  else if (fn === '_css' && kind === 'gtm.element' && typeof value === 'string') trigger.selectors.push(value)
  else if (fn === '_cn' && kind === 'gtm.elementUrl' && typeof value === 'string') trigger.urlContains.push(value)
  else trigger.unsupported.push(`${label} = ${JSON.stringify(value)}`)
}

const clausesOf = (rule: unknown[]): Clause[] =>
  rule.filter(Array.isArray).map((clause) => ({ op: clause[0], args: clause.slice(1) }))

const targets = (clauses: Clause[], op: string, tag: number): boolean =>
  clauses.some((clause) => clause.op === op && clause.args.includes(tag))

function conditionsOf(clauses: Clause[], container: ContainerResource, trigger: Trigger): void {
  for (const clause of clauses) {
    if (clause.op === 'add' || clause.op === 'block') continue
    // `unless` nega i suoi predicati; leggerli come requisiti invertirebbe il senso del
    // trigger, quindi l'intera clausola si dichiara illeggibile.
    if (clause.op !== 'if') {
      trigger.unsupported.push(`\`${String(clause.op)}\` clause`)
      continue
    }
    for (const index of clause.args) applyPredicate(trigger, container, index)
  }
}

/** GTM tiene separati tag e condizioni: una regola elenca clausole, con `if` e `unless` che
 *  nominano predicati e `add` e `block` che nominano tag. Un trigger per regola che aggiunge il tag. */
export function extractTriggers(container: ContainerResource): Trigger[] {
  const triggers: Trigger[] = []

  for (const [tag, definition] of container.tags.entries()) {
    if (definition.function !== GA4_EVENT_TAG) continue
    const name = definition.vtp_eventName
    const eventName = typeof name === 'string' ? name : `tag #${String(tag)}`
    const rules = container.rules.map(clausesOf)
    const blocked = rules.some((clauses) => targets(clauses, 'block', tag))

    for (const clauses of rules.filter((clauses) => targets(clauses, 'add', tag))) {
      const trigger: Trigger = { eventName, firesOn: [], selectors: [], urlContains: [], unsupported: [] }
      if (blocked) trigger.unsupported.push('a `block` rule targets this tag')
      conditionsOf(clauses, container, trigger)
      triggers.push(trigger)
    }
  }

  return triggers
}
