import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import type { Manifest } from './alignment.ts'
import { type Finding, type Hit, readLines } from './cli.ts'
import { DEPENDENCY_FEATURES, featuresOn, type OfficinaConfig } from './config.ts'

const DICTIONARIES = 'src/i18n/strings'
const CONTENT = 'src/content/'
const CONTENT_EXTENSIONS: readonly string[] = ['.yml', '.yaml', '.json', '.md', '.mdx', '.mdoc']
const DEFAULT_SOURCES: readonly string[] = ['src/lib/site.ts', 'src/lib/company.ts']
const CONTACT_ENV_KEYS: readonly string[] = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME', 'CONTACT_TO_EMAIL']

const TOKEN = /<[A-Z][A-Z_]{2,}>/
const DOMAIN = /\bexample\.com\b/
const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*)/
const ZERO_POSTAL_CODE = /\bpostalCode:\s*(['"])00000\1/
const EMPTY_HREF = /\bhref:\s*(['"])#\1/
const PLACEHOLDER_IMAGE = /\bassets\/placeholder\.jpg\b/

type EnvHit = Omit<Finding, 'path'>

// `SENSITIVE_ENV_VALUE_PLACEHOLDER` di vercel@62.2.0: `vercel pull` lo scrive al posto del valore di una Secret.
const SENSITIVE = '[SENSITIVE]'

const WITHOUT_VALUE = 'il deploy andrebbe online senza il suo valore'

const dictionaries = (): string[] =>
  existsSync(DICTIONARIES)
    ? readdirSync(DICTIONARIES)
        .filter((name) => name.endsWith('.ts'))
        .sort()
        .map((name) => join(DICTIONARIES, name))
    : []

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return entry.isFile() ? [path] : []
  })

const contentFiles = (): string[] =>
  existsSync(CONTENT)
    ? filesUnder(CONTENT)
        .filter((path) => CONTENT_EXTENSIONS.some((extension) => path.endsWith(extension)))
        .sort()
    : []

export function placeholderSources(config: OfficinaConfig = {}): string[] {
  const declared = config.placeholders?.sources ?? [...DEFAULT_SOURCES, ...dictionaries()]
  return [...new Set([...declared, ...contentFiles()])]
}

export const isContent = (path: string): boolean => path.startsWith(CONTENT)

export const contactEnvKeys = (config: OfficinaConfig = {}): readonly string[] =>
  config.placeholders?.contactEnvKeys ?? CONTACT_ENV_KEYS

export function requiredEnvKeys(config: OfficinaConfig, manifest: Manifest): string[] {
  const on = featuresOn(config, manifest)
  const secrets = on.map((name) => DEPENDENCY_FEATURES[name].secret)
  return [...new Set([...contactEnvKeys(config), ...secrets])]
}

function literalFindings(value: string): string[] {
  const messages: string[] = []
  const token = value.match(TOKEN)
  if (token) messages.push(`segnaposto del template ${token[0]}`)
  if (DOMAIN.test(value)) messages.push('dominio segnaposto example.com')
  if (/^\+390+$/.test(value.replace(/\s/g, ''))) messages.push(`telefono segnaposto ${value}`)
  return messages
}

function lineMessages(text: string): string[] {
  const messages = [...text.matchAll(STRING_LITERAL)].flatMap((match) => literalFindings(match[0].slice(1, -1)))
  if (ZERO_POSTAL_CODE.test(text)) messages.push('CAP segnaposto 00000')
  if (EMPTY_HREF.test(text)) messages.push("profilo senza indirizzo: href: '#'")
  return messages
}

export function sourceFindings(source: string): Hit[] {
  return readLines(source).flatMap(({ n, text }) =>
    COMMENT_ONLY.test(text) ? [] : lineMessages(text).map((message) => ({ line: n, message })),
  )
}

// YAML e Markdown scrivono i valori senza apici, e in Markdown una riga che comincia con `*` è una voce d'elenco.
export function contentFindings(source: string): Hit[] {
  return readLines(source).flatMap(({ n, text }) => {
    const messages = new Set([...lineMessages(text), ...literalFindings(text)])
    if (PLACEHOLDER_IMAGE.test(text)) messages.add('foto di prova assets/placeholder.jpg')
    return [...messages].map((message) => ({ line: n, message }))
  })
}

export function envFindings(content: string, keys: readonly string[]): EnvHit[] {
  const env = parseEnv(content)
  const lines = readLines(content)
  return keys.flatMap((key): EnvHit[] => {
    const value = env[key]?.trim()
    const declaration = lines.find(({ text }) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(text))
    if (value === undefined || declaration === undefined) {
      const message = `${key} non c'è fra le variabili di produzione su Vercel: ${WITHOUT_VALUE}`
      return [{ severity: 'error', message }]
    }
    const hit = (severity: Finding['severity'], message: string): EnvHit[] => [
      { line: declaration.n, severity, message: `${key} ${message}` },
    ]
    if (value === SENSITIVE)
      return hit(
        'warning',
        'è Secret su Vercel: vercel pull non ne scarica il valore, e il deploy non lo può verificare',
      )
    if (value === '') return hit('error', `è vuota: ${WITHOUT_VALUE}`)
    if (TOKEN.test(value) || DOMAIN.test(value)) return hit('error', 'porta un segnaposto del template')
    return []
  })
}

export const outputFindings = (dir: string): Finding[] =>
  filesUnder(dir)
    .filter((path) => readFileSync(path).includes(SENSITIVE))
    .sort()
    .map(
      (path): Finding => ({
        path,
        severity: 'error',
        message: `contiene ${SENSITIVE}, il segnaposto che vercel pull scrive per una variabile Secret: la build l'ha incorporato al posto del valore`,
      }),
    )
