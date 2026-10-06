import type { Finding } from './cli.ts'
import type { EnvField } from './env-schema.ts'

const SCHEMA = 'astro.config.mjs'
const MIN_SEARCHABLE = 8

export function secretFields(fields: readonly EnvField[]): EnvField[] {
  const secrets = fields.filter(({ context, access }) => context === 'server' && access === 'secret')
  return secrets.filter(({ key }, index) => secrets.findIndex((field) => field.key === key) === index)
}

export const canary = (key: string): string => `officina-${key}-canary`

// Astro valida ogni variabile sul tipo e sulle validazioni del suo envField: un canary di testo non
// è un `number`, un `boolean` né un `enum`, e non rispetta `url`, `startsWith` e simili.
export const canaryLines = (secrets: readonly EnvField[]): string[] =>
  secrets.filter(({ type, constrained }) => type === 'string' && !constrained).map(({ key }) => `${key}=${canary(key)}`)

// Le due forme in cui il runtime di Astro scrive un valore: escapeHTML nel markup, stringifyForScript
// negli script (astro/dist/runtime/server/escape.js).
const written = (value: string): string[] => [
  value,
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll("'", '&#39;')
    .replaceAll('"', '&quot;'),
  JSON.stringify(value).slice(1, -1).replaceAll('<', '\\u003c'),
]

interface Target {
  key: string
  value: string
  needles: string[]
}

interface Leak {
  path: string
  key: string
  viaCanary: boolean
}

export interface SecretScan {
  findings: Finding[]
  verified: string[]
}

function target(key: string, raw: string | undefined): Target {
  const value = raw?.trim() ?? ''
  const own = value.length >= MIN_SEARCHABLE && value !== canary(key) ? written(value) : []
  return { key, value, needles: [...new Set([canary(key), ...own])] }
}

const searchable = ({ value }: Target): boolean => value.length >= MIN_SEARCHABLE

const leaksIn = (path: string, content: Buffer, targets: readonly Target[]): Leak[] =>
  targets
    .filter(({ needles }) => needles.some((needle) => content.includes(needle)))
    .map(({ key }) => ({ path, key, viaCanary: content.includes(canary(key)) }))

const leakFinding = ({ path, key, viaCanary }: Leak): Finding => ({
  path,
  severity: 'error',
  message: `contiene ${viaCanary ? 'il canary' : 'il valore'} di \`${key}\`, una chiave server e secret di env.schema`,
})

const unverifiable = ({ key, value }: Target): Finding => ({
  path: SCHEMA,
  severity: 'warning',
  message:
    value === ''
      ? `\`${key}\` non si verifica: nell'ambiente non ci sono né il suo valore né il canary`
      : `\`${key}\` non si verifica: il suo valore ha meno di ${MIN_SEARCHABLE} caratteri, e cercarlo darebbe falsi positivi`,
})

export function scanSecrets(
  keys: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  files: readonly string[],
  read: (path: string) => Buffer,
): SecretScan {
  const targets = keys.map((key) => target(key, env[key]))
  const leaks = files.flatMap((path) => leaksIn(path, read(path), targets))
  const leaked = new Set(leaks.map(({ key }) => key))
  const clean = targets.filter(({ key }) => !leaked.has(key))
  return {
    findings: [...leaks.map(leakFinding), ...clean.filter((t) => !searchable(t)).map(unverifiable)],
    verified: clean.filter(searchable).map(({ key }) => key),
  }
}
