import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Finché `doctor` viaggia dentro il pacchetto, la versione del pacchetto è la versione del
// contratto: è con questa che si confronta il riferimento delle action nei workflow del progetto.
interface SelfManifest {
  version: string
  peerDependencies?: Record<string, string>
}

const self = (): SelfManifest =>
  JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as SelfManifest

export const packageVersion = (): string => self().version

/** L'intervallo che il pacchetto dichiara di reggere: sta in un posto solo, le sue peerDependencies. */
export const peerRange = (name: string): string => self().peerDependencies?.[name] ?? ''

type Version = [major: number, minor: number, patch: number]

const EXACT = /(\d+)\.(\d+)\.(\d+)/

function parseVersion(text: string): Version | undefined {
  const found = EXACT.exec(text)
  return found === null ? undefined : [Number(found[1]), Number(found[2]), Number(found[3])]
}

const compare = (a: Version, b: Version): number => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]

// Il limite superiore escluso di ciò che lo specificatore può installare: `^` sale fino alla major
// dopo (fino alla minor dopo, sotto lo zero), `~` fino alla minor dopo, una versione esatta a sé.
function ceiling(spec: string, [major, minor, patch]: Version): Version | undefined {
  if (spec.startsWith('^')) return major === 0 ? [0, minor + 1, 0] : [major + 1, 0, 0]
  if (spec.startsWith('~')) return [major, minor + 1, 0]
  return EXACT.test(spec.replace(/^[=v]/, '')) && !/[<>|*x\s]/.test(spec) ? [major, minor, patch + 1] : undefined
}

function parseBounds(range: string): { min: Version; max: Version } | undefined {
  const [low = '', high = '', extra] = range.split(' ')
  if (extra !== undefined || !low.startsWith('>=') || !high.startsWith('<')) return undefined
  const min = parseVersion(low)
  const max = parseVersion(high)
  return min === undefined || max === undefined ? undefined : { min, max }
}

/** Vero solo se ogni versione che `spec` può installare sta dentro `range`, scritto `>=x.y.z <a.b.c`. */
export function withinRange(spec: string, range: string): boolean {
  const bounds = parseBounds(range)
  const floor = parseVersion(spec)
  if (bounds === undefined || floor === undefined) return false
  const top = ceiling(spec, floor)
  return top === undefined ? false : compare(floor, bounds.min) >= 0 && compare(top, bounds.max) <= 0
}
