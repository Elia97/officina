import { existsSync, readFileSync } from 'node:fs'
import { posix } from 'node:path'

import type { Hit } from './cli.ts'
import { blankFences, blankSpans, linkDestinations } from './markdown.ts'

const SCANNED = /\.md$/
const ROADMAP = 'docs/ROADMAP.md'

const IGNORED = [
  // Scritti a runtime dai comandi, gitignored per costruzione.
  /^\.claude\/plans\//,
  // Un PDF in docs/ è generato dai .md accanto, mai tracciato.
  /\.pdf$/,
  /^docs\/sources\//,
]

const PATH_REFERENCE = /`((?:docs|src|scripts|test|e2e|public|\.claude|\.github)\/[A-Za-z0-9._/-]+\.[a-z]+)`/g
const NAME_REFERENCE = /`([A-Za-z0-9._-]+)`/g
// La virgola non delimita: i titoli la contengono.
const SECTION_REFERENCE = /`([A-Za-z0-9._/-]+\.md)`\s*§\s*([^.·|)§]{1,80})/g
const LINK_TEXT = /\[[^[\]]*\]\(/g

const ROOT_DOCUMENT = /^[A-Z][A-Z0-9_-]*\.md$/
// I file tracciati alla radice di template/vetrina (git ls-files), Markdown esclusi.
const ROOT_CONFIG: ReadonlySet<string> = new Set([
  '.editorconfig',
  '.env.example',
  '.fallowrc.jsonc',
  '.gitignore',
  '.lighthouserc.json',
  '.npmrc',
  '.nvmrc',
  '.release-please-manifest.json',
  'astro.config.mjs',
  'biome.json',
  'commitlint.config.js',
  'lefthook.yml',
  'officina.config.ts',
  'package.json',
  'playwright.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'release-please-config.json',
  'tsconfig.json',
  'vercel.json',
  'vitest.config.ts',
])
const CHANGELOG = /(?:^|\/)CHANGELOG\.md$/
const SITE_CONTENT = /^src\/content\//
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|#|\/)/i

interface Reference {
  index: number
  target: string
}

const isIgnored = (path: string) => IGNORED.some((re) => re.test(path))

export const isScanned = (path: string): boolean => SCANNED.test(path) && !isIgnored(path)

export function normalizeTitle(raw: string): string {
  return (
    raw
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      // Il marcatore non fa parte del nome: «Come si lavora [HARD]» si cita «Come si lavora».
      .replace(/\s*\[[A-Z-]+\]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  )
}

export function headings(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => /^#{2,4} /.test(line))
    .map((line) => normalizeTitle(line.replace(/^#+\s*/, '')))
}

const resolves = (titles: string[], cited: string) =>
  titles.some(
    (title) => cited === title || (cited.startsWith(title) && /^[^\p{L}\p{N}]/u.test(cited.slice(title.length))),
  )

export function resolveTarget(from: string, cited: string): string {
  if (cited.includes('/')) return cited
  const candidates = [`${from.slice(0, from.lastIndexOf('/') + 1)}${cited}`, cited, `docs/${cited}`]
  return candidates.find((candidate) => existsSync(candidate)) ?? cited
}

const references = (text: string, pattern: RegExp): Reference[] =>
  [...text.matchAll(pattern)]
    .map((match) => ({ index: match.index, target: match[1] }))
    .filter((reference): reference is Reference => reference.target !== undefined)

const pathReferences = (flat: string): Reference[] =>
  references(flat, PATH_REFERENCE).filter(({ target }) => !target.includes('*'))

function nameReferences(path: string, flat: string): Reference[] {
  if (path === ROADMAP || CHANGELOG.test(path) || SITE_CONTENT.test(path)) return []
  const labels = [...flat.matchAll(LINK_TEXT)].map(({ index, 0: text }) => ({ start: index, end: index + text.length }))
  const inLabel = (index: number) => labels.some(({ start, end }) => index > start && index < end)
  return references(flat, NAME_REFERENCE)
    .filter(({ index, target }) => (ROOT_DOCUMENT.test(target) || ROOT_CONFIG.has(target)) && !inLabel(index))
    .map(({ index, target }) => ({ index, target: resolveTarget(path, target) }))
}

const linkTarget = (from: string, destination: string): string | undefined =>
  EXTERNAL.test(destination)
    ? undefined
    : posix.normalize(posix.join(posix.dirname(from), destination.replace(/[#?].*$/, '')))

function linkReferences(path: string, code: string): Reference[] {
  if (SITE_CONTENT.test(path)) return []
  return linkDestinations(code).flatMap(({ index, destination }) => {
    const target = linkTarget(path, destination)
    return target === undefined ? [] : [{ index, target }]
  })
}

const escapes = (target: string) => target === '..' || target.startsWith('../')

const isMissing = (target: string) => !isIgnored(target) && (escapes(target) || !existsSync(target))

function sectionFindings(path: string, flat: string, lineOf: (index: number) => number, missing: Set<string>): Hit[] {
  const findings: Hit[] = []
  for (const match of flat.matchAll(SECTION_REFERENCE)) {
    const [, file, title] = match
    /* v8 ignore next -- i due gruppi sono obbligatori nella regex, ma noUncheckedIndexedAccess pretende la guardia */
    if (!file || !title) continue
    const line = lineOf(match.index)
    const target = resolveTarget(path, file)
    if (isIgnored(target) || missing.has(`${line}:${target}`)) continue
    if (!existsSync(target)) {
      findings.push({ line, message: `sezione in un file che non esiste: ${target}` })
      continue
    }
    const cited = normalizeTitle(title)
    if (!resolves(headings(readFileSync(target, 'utf8')), cited))
      findings.push({ line, message: `sezione che non esiste: ${target} § ${cited}` })
  }
  return findings
}

export function findingsFor(path: string, source: string): Hit[] {
  const fenced = blankFences(source)
  // Un titolo va a capo come qualunque prosa: si cerca su testo continuo. La sostituzione è uno a
  // uno, quindi gli offset restano quelli del sorgente e la riga si conta da lì.
  const flat = fenced.replace(/\n/g, ' ')
  const lineOf = (index: number) => source.slice(0, index).split('\n').length
  const missing = new Map<string, { line: number; target: string }>()
  for (const { index, target } of [
    ...pathReferences(flat),
    ...nameReferences(path, flat),
    ...linkReferences(path, blankSpans(fenced)),
  ]) {
    const line = lineOf(index)
    if (isMissing(target)) missing.set(`${line}:${target}`, { line, target })
  }
  const paths = [...missing.values()].map(({ line, target }) => ({
    line,
    message: `percorso che non esiste: ${target}`,
  }))
  return [...paths, ...sectionFindings(path, flat, lineOf, new Set(missing.keys()))].sort((a, b) => a.line - b.line)
}
