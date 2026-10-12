export type CiScope = { docsOnly: boolean; reason: string }

const DOCUMENTS = [/^[^/]+\.md$/, /^(?:docs|\.github|\.claude)\/.+\.md$/]

export const isDocument = (path: string): boolean => DOCUMENTS.some((pattern) => pattern.test(path))

const fullRun = (reason: string): CiScope => ({ docsOnly: false, reason: `percorso completo: ${reason}` })

export function ciScope(base: string | undefined, changed: (base: string) => string[]): CiScope {
  if (base === undefined) return fullRun("l'evento non ha una base con cui confrontarsi")
  let paths: string[]
  try {
    paths = changed(base)
  } catch (error) {
    return fullRun(`il diff da ${base} non è riuscito: ${(error as Error).message}`)
  }
  if (paths.length === 0) return fullRun(`nessun file cambiato da ${base}`)
  const code = paths.find((path) => !isDocument(path))
  if (code !== undefined) return fullRun(`${code} non è un documento`)
  return { docsOnly: true, reason: `percorso veloce: solo documenti (${paths.length} file)` }
}
