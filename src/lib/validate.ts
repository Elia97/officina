// Un validatore minimo, senza dipendenze nuove: la forma di officina.config.ts è piccola e fissa,
// e quello che serve è il percorso della voce sbagliata, non «la configurazione non è valida».
export type Check = (value: unknown, path: string) => string[]

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const NAMES = new Map<string, string>([
  ['string', 'una stringa'],
  ['number', 'un numero'],
  ['boolean', 'un booleano'],
  ['function', 'una funzione'],
  ['undefined', 'niente'],
])

export function typeName(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'un array'
  return NAMES.get(typeof value) ?? 'un oggetto'
}

export const problem = (path: string, expected: string, value: unknown): string =>
  `${path}: atteso ${expected}, ricevuto ${typeName(value)}`

export const aString: Check = (value, path) => (typeof value === 'string' ? [] : [problem(path, 'una stringa', value)])

export const aNumber: Check = (value, path) => (typeof value === 'number' ? [] : [problem(path, 'un numero', value)])

export const aFunction: Check = (value, path) =>
  typeof value === 'function' ? [] : [problem(path, 'una funzione', value)]

export const aStringOrNull: Check = (value, path) =>
  typeof value === 'string' || value === null ? [] : [problem(path, 'una stringa oppure null', value)]

export const anArrayOf =
  (item: Check): Check =>
  (value, path) =>
    Array.isArray(value)
      ? value.flatMap((entry, index) => item(entry, `${path}[${index}]`))
      : [problem(path, 'un array', value)]

export const aRecordOf =
  (item: Check): Check =>
  (value, path) =>
    isRecord(value)
      ? Object.entries(value).flatMap(([key, entry]) => item(entry, `${path}.${key}`))
      : [problem(path, 'un oggetto', value)]

export const oneOf =
  (expected: string, allowed: readonly unknown[]): Check =>
  (value, path) =>
    allowed.includes(value) ? [] : [problem(path, expected, value)]

// Una voce non dichiarata è un errore: `sitUrl` al posto di `siteUrl` non deve passare in
// silenzio, che è il modo esatto in cui una configurazione smette di dire qualcosa.
export const aShape =
  (fields: Record<string, Check>): Check =>
  (value, path) => {
    if (!isRecord(value)) return [problem(path, 'un oggetto', value)]
    const prefix = path === '' ? '' : `${path}.`
    return Object.entries(value).flatMap(([key, entry]) => {
      const check = fields[key]
      if (check === undefined) return [`${prefix}${key}: voce sconosciuta`]
      return entry === undefined ? [] : check(entry, `${prefix}${key}`)
    })
  }
