export type CiScope = { path: 'docs' | 'release' | 'full'; reason: string }

type Changed = (base: string) => string[]
type Read = (ref: string, path: string) => string

const DOCUMENTS = [/^[^/]+\.md$/, /^(?:docs|\.github|\.claude)\/.+\.md$/]

// I file che release-please scrive nella PR di release di un pacchetto `node`.
const RELEASE_FILES = ['CHANGELOG.md', '.release-please-manifest.json', 'package.json']

export const isDocument = (path: string): boolean => DOCUMENTS.some((pattern) => pattern.test(path))

const fullRun = (reason: string): CiScope => ({ path: 'full', reason: `percorso completo: ${reason}` })

function withoutVersion(text: string): string {
  const { version: _version, ...rest } = JSON.parse(text) as Record<string, unknown>
  return JSON.stringify(rest)
}

function packageChange(base: string, read: Read): string | undefined {
  try {
    if (withoutVersion(read(base, 'package.json')) === withoutVersion(read('HEAD', 'package.json'))) return undefined
    return 'package.json cambia oltre a version'
  } catch (error) {
    return `package.json non si confronta con ${base}: ${(error as Error).message}`
  }
}

function releaseScope(base: string, paths: string[], read: Read): CiScope {
  const code = paths.find((path) => !isDocument(path) && !RELEASE_FILES.includes(path))
  if (code !== undefined) return fullRun(`${code} non è un documento`)
  const extra = paths.find((path) => !RELEASE_FILES.includes(path))
  if (extra !== undefined) return fullRun(`${extra} non fa parte di una release`)
  const problem = paths.includes('package.json') ? packageChange(base, read) : undefined
  if (problem !== undefined) return fullRun(problem)
  const files = paths.map((path) => (path === 'package.json' ? 'package.json (version)' : path))
  return { path: 'release', reason: `percorso della release: solo ${files.join(', ')}` }
}

export function ciScope(base: string | undefined, changed: Changed, read: Read): CiScope {
  if (base === undefined) return fullRun("l'evento non ha una base con cui confrontarsi")
  let paths: string[]
  try {
    paths = changed(base)
  } catch (error) {
    return fullRun(`il diff da ${base} non è riuscito: ${(error as Error).message}`)
  }
  if (paths.length === 0) return fullRun(`nessun file cambiato da ${base}`)
  if (paths.every(isDocument)) return { path: 'docs', reason: `percorso veloce: solo documenti (${paths.length} file)` }
  return releaseScope(base, paths, read)
}
