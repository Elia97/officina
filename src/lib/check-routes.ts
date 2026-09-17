import { existsSync, readFileSync } from 'node:fs'

import type { Hit } from './cli.ts'

const SCANNED = /\.md$/

const IGNORED = [
  // Scritti a runtime dai comandi, gitignored per costruzione.
  /^\.claude\/plans\//,
  // Un PDF in docs/ è generato dai .md accanto, mai tracciato.
  /\.pdf$/,
  /^docs\/sources\//,
]

const PATH_REFERENCE = /`((?:docs|src|scripts|test|public|\.claude|\.github)\/[A-Za-z0-9._/-]+\.[a-z]+)`/g
// La virgola non delimita: i titoli la contengono.
const SECTION_REFERENCE = /`([A-Za-z0-9._/-]+\.md)`\s*§\s*([^.·|)§]{1,80})/g

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
  const sibling = `${from.slice(0, from.lastIndexOf('/') + 1)}${cited}`
  return existsSync(sibling) ? sibling : cited
}

export function findingsFor(path: string, source: string): Hit[] {
  const findings: Hit[] = []
  // Un titolo va a capo come qualunque prosa: si cerca su testo continuo. La sostituzione è uno a
  // uno, quindi gli offset restano quelli del sorgente e la riga si conta da lì.
  const flat = source.replace(/\n/g, ' ')
  const lineOf = (index: number) => source.slice(0, index).split('\n').length
  const missingTargets = new Set<string>()

  for (const match of flat.matchAll(PATH_REFERENCE)) {
    const target = match[1]
    if (!target || isIgnored(target) || target.includes('*') || existsSync(target)) continue
    missingTargets.add(target)
    findings.push({ line: lineOf(match.index), message: `percorso che non esiste: ${target}` })
  }

  for (const match of flat.matchAll(SECTION_REFERENCE)) {
    const [, file, title] = match
    if (!file || !title) continue
    const line = lineOf(match.index)
    const target = resolveTarget(path, file)
    if (isIgnored(target) || missingTargets.has(target)) continue
    if (!existsSync(target)) {
      findings.push({ line, message: `sezione in un file che non esiste: ${target}` })
      continue
    }
    const cited = normalizeTitle(title)
    if (!resolves(headings(readFileSync(target, 'utf8')), cited))
      findings.push({ line, message: `sezione che non esiste: ${target} § ${cited}` })
  }

  return findings.sort((a, b) => a.line - b.line)
}
