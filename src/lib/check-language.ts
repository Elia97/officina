import type { Hit } from './cli.ts'
import { commentBlocks, type Line, styleOf } from './comment-syntax.ts'
import { ENGLISH, ITALIAN } from './language-words.ts'

const CODE =
  /^(?:(?:src|scripts|test|\.claude\/hooks|\.github)\/.*|[^/]+)\.(?:ts|tsx|astro|mjs|cjs|js|css|ya?ml|jsonc)$/
// Fuori le fonti del cliente (materiale altrui) e i changelog, generati in inglese.
const DOCS = /^(?!docs\/sources\/)(?!(?:.*\/)?CHANGELOG\.md$).*\.md$/
// I dizionari sono copy per l'utente nelle lingue del sito: en e de leggono inglese e tedesco
// per definizione, ed è il solo posto sotto CODE dove non deve leggersi italiano.
const LOCALIZED = /^src\/i18n\/strings\//

// Sotto questa soglia il campione non dice niente: meglio indeciso che indovinato.
const MIN_HITS = 4
// Un documento italiano che cita frasi inglesi non deve scattare: serve una maggioranza netta.
const ENGLISH_SHARE = 0.6

// Inglese per costruzione, da togliere prima di contare: frontmatter, blocchi e span di
// codice, URL, destinazioni dei link, riferimenti puntati (`this.cache`), chiamate, direttive.
const NOISE: RegExp[] = [
  /^---\r?\n[\s\S]*?\r?\n---/,
  /```[\s\S]*?```/g,
  /`[^`\n]*`/g,
  /https?:\/\/\S+/g,
  /\]\([^)]*\)/g,
  /[\w$]+(?:\.[\w$]+)+/g,
  /[\w$]+\([^)]*\)/g,
  /@[\w-]+/g,
]

export function isScanned(path: string): boolean {
  if (LOCALIZED.test(path)) return false
  return CODE.test(path) || DOCS.test(path)
}

function clean(prose: string): string {
  return NOISE.reduce((text, re) => text.replace(re, ' '), prose)
}

export interface Tally {
  italian: number
  english: number
}

export function tally(prose: string): Tally {
  const text = clean(prose)
  return {
    italian: (text.match(ITALIAN) ?? []).length,
    english: (text.match(ENGLISH) ?? []).length,
  }
}

export type Verdict = 'english' | 'italian' | 'undecided'

export function classify({ italian, english }: Tally, minHits = MIN_HITS): Verdict {
  const hits = italian + english
  // Le liste di language-words.ts portano solo parole di una lingua sola: una inglese senza
  // nessuna italiana decide anche un commento troppo corto per raggiungere MIN_HITS.
  if (english > 0 && italian === 0) return 'english'
  if (hits < minHits) return 'undecided'
  return english / hits >= ENGLISH_SHARE ? 'english' : 'italian'
}

const describe = ({ english, italian }: Tally, sample: string) =>
  `legge come inglese (en ${english} / it ${italian}): ${sample.replace(/\s+/g, ' ').trim().slice(0, 60)}`

const toLines = (source: string): Line[] => source.split('\n').map((text, i) => ({ n: i + 1, text }))

/** In un sorgente la prosa sta solo nei commenti: il codice è inglese per costruzione. */
export function findingsFor(path: string, source: string): Hit[] {
  if (!CODE.test(path)) {
    const counts = tally(source)
    return classify(counts) === 'english' ? [{ line: 1, message: describe(counts, source) }] : []
  }

  const blocks = commentBlocks(toLines(source), styleOf(path))
  const findings: Hit[] = []
  const total: Tally = { italian: 0, english: 0 }

  for (const block of blocks) {
    const [first] = block.lines
    const text = block.lines.map((line) => line.text).join('\n')
    const counts = tally(text)
    total.italian += counts.italian
    total.english += counts.english
    if (first && classify(counts) === 'english')
      findings.push({
        line: first.n,
        message: describe(counts, text),
      })
  }

  // Molti commenti brevi in inglese non fanno scattare nessun blocco da soli, ma insieme sì.
  const firstLine = blocks[0]?.lines[0]
  if (findings.length === 0 && classify(total) === 'english' && firstLine)
    findings.push({
      line: firstLine.n,
      message: describe(total, 'nel complesso'),
    })

  return findings
}
