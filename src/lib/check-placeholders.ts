import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'

import { type Finding, type Hit, readLines } from './cli.ts'

const DICTIONARIES = 'src/i18n/strings'
const CONTACT_ENV_KEYS = ['CONTACT_FROM_EMAIL', 'CONTACT_FROM_NAME', 'CONTACT_TO_EMAIL'] as const

const TOKEN = /<[A-Z][A-Z_]{2,}>/
const DOMAIN = /\bexample\.com\b/
const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
const COMMENT_ONLY = /^\s*(?:\/\/|\/\*|\*)/
const ZERO_POSTAL_CODE = /\bpostalCode:\s*(['"])00000\1/
const EMPTY_HREF = /\bhref:\s*(['"])#\1/

type EnvHit = Omit<Finding, 'path' | 'severity'>

export function placeholderSources(): string[] {
  const dictionaries = readdirSync(DICTIONARIES)
    .filter((name) => name.endsWith('.ts'))
    .sort()
    .map((name) => join(DICTIONARIES, name))
  return ['src/lib/site.ts', 'src/lib/company.ts', ...dictionaries]
}

function literalFindings(value: string): string[] {
  const messages: string[] = []
  const token = value.match(TOKEN)
  if (token) messages.push(`segnaposto del template ${token[0]}`)
  if (DOMAIN.test(value)) messages.push('dominio segnaposto example.com')
  if (/^\+390+$/.test(value.replace(/\s/g, ''))) messages.push(`telefono segnaposto ${value}`)
  return messages
}

export function sourceFindings(source: string): Hit[] {
  return readLines(source).flatMap(({ n, text }) => {
    if (COMMENT_ONLY.test(text)) return []
    const messages = [...text.matchAll(STRING_LITERAL)].flatMap((match) => literalFindings(match[0].slice(1, -1)))
    if (ZERO_POSTAL_CODE.test(text)) messages.push('CAP segnaposto 00000')
    if (EMPTY_HREF.test(text)) messages.push("profilo senza indirizzo: href: '#'")
    return messages.map((message) => ({ line: n, message }))
  })
}

export function envFindings(content: string): EnvHit[] {
  const env = parseEnv(content)
  const lines = readLines(content)
  return CONTACT_ENV_KEYS.flatMap((key): EnvHit[] => {
    const value = env[key]?.trim() ?? ''
    const declaration = lines.find(({ text }) => new RegExp(`^\\s*${key}\\s*=`).test(text))
    const at = declaration ? { line: declaration.n } : {}
    if (value === '') return [{ ...at, message: `${key} non è impostata: vale il default di astro.config.mjs` }]
    if (TOKEN.test(value) || DOMAIN.test(value)) return [{ ...at, message: `${key} porta un segnaposto del template` }]
    return []
  })
}
