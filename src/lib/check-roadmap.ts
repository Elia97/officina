import type { Hit } from './cli.ts'

// Le giornate stanno in due posti — la tabella Status e la testata di ogni sezione — e sono la
// fonte contrattuale: se i due non concordano, non fallisce niente finché qualcuno non somma.

export interface Row {
  line: number
  number: number
  name: string
  phase: number
  days: number
}

export interface Subtotal {
  line: number
  label: string
  phase: number | null
  days: number
}

export interface Section {
  line: number
  number: number
  name: string
  phase: number
  days: number
}

/** «1,5» è una giornata e mezza. Una cella vuota non è zero giornate: `Number('')` sarebbe 0. */
export function parseDays(raw: string): number {
  const text = raw.trim().replace(',', '.')
  return text === '' ? Number.NaN : Number(text)
}

const cell = (row: string) => row.split('|').map((c) => c.trim())

const ROW = /^\|\s*(\d+)\s*\|/
const SUBTOTAL = /^\|\s*\|\s*\*\*(FASE (\d+)[^*]*|TOTALE)\*\*/
const SECTION = /^## Milestone (\d+) — (.+)$/
const HEADER = /^\*\*Fase (\d+)\*\*\s*·\s*\*\*([\d,]+) gg\*\*/

/** Le righe numerate della tabella Status: una per milestone. */
export function statusRows(source: string): Row[] {
  const rows: Row[] = []
  source.split('\n').forEach((line, i) => {
    const match = ROW.exec(line)
    if (!match?.[1]) return
    const cells = cell(line)
    const number = Number(match[1])
    const name = cells[2]
    const phase = Number(cells[3])
    const days = parseDays(cells[4] ?? '')
    if (!name || Number.isNaN(phase) || Number.isNaN(days)) return
    rows.push({ line: i + 1, number, name, phase, days })
  })
  return rows
}

/** Le righe di somma: un subtotale per fase, più il totale. */
export function subtotals(source: string): Subtotal[] {
  const out: Subtotal[] = []
  source.split('\n').forEach((line, i) => {
    const match = SUBTOTAL.exec(line)
    if (!match?.[1]) return
    const days = parseDays((cell(line)[4] ?? '').replace(/\*/g, ''))
    if (Number.isNaN(days)) return
    out.push({ line: i + 1, label: match[1], phase: match[2] ? Number(match[2]) : null, days })
  })
  return out
}

/** Le sezioni `## Milestone N`, con la fase e le giornate della loro testata. */
export function sections(source: string): Section[] {
  const lines = source.split('\n')
  const out: Section[] = []
  lines.forEach((line, i) => {
    const match = SECTION.exec(line)
    if (!match?.[1] || !match[2]) return
    // La testata sta nelle righe subito sotto il titolo, dopo il riferimento alla Milestone GitHub.
    const header = lines.slice(i, i + 6).find((l) => HEADER.test(l))
    const parsed = header ? HEADER.exec(header) : null
    if (!parsed?.[1] || !parsed[2]) return
    out.push({
      line: i + 1,
      number: Number(match[1]),
      name: match[2].trim(),
      phase: Number(parsed[1]),
      days: parseDays(parsed[2]),
    })
  })
  return out
}

const sum = (values: number[]) => Number(values.reduce((a, b) => a + b, 0).toFixed(2))

/** I subtotali di fase e il totale devono essere la somma delle righe che coprono. */
function totalsAgree(rows: Row[], totals: Subtotal[]): Hit[] {
  const findings: Hit[] = []
  for (const total of totals) {
    const covered = total.phase === null ? rows : rows.filter((r) => r.phase === total.phase)
    const expected = sum(covered.map((r) => r.days))
    if (expected !== total.days)
      findings.push({
        line: total.line,
        message: `${total.label}: la riga dice ${total.days} ma le milestone sommano ${expected}`,
      })
  }
  return findings
}

/** Ogni riga della tabella ha la sua sezione, e le due dicono le stesse giornate e la stessa fase. */
function rowsAgree(rows: Row[], byNumber: Map<number, Section>): Hit[] {
  const findings: Hit[] = []
  for (const row of rows) {
    const section = byNumber.get(row.number)
    if (!section) {
      findings.push({ line: row.line, message: `milestone ${row.number} in tabella ma senza sezione` })
      continue
    }
    if (section.days !== row.days)
      findings.push({
        line: section.line,
        message: `milestone ${row.number}: la tabella dice ${row.days} gg, la sezione ${section.days}`,
      })
    if (section.phase !== row.phase)
      findings.push({
        line: section.line,
        message: `milestone ${row.number}: la tabella la mette in fase ${row.phase}, la sezione in fase ${section.phase}`,
      })
  }
  return findings
}

/** Una sezione che la tabella non elenca è lavoro che nessun totale conta. */
function sectionsAreListed(rows: Row[], byNumber: Map<number, Section>): Hit[] {
  const numbers = new Set(rows.map((r) => r.number))
  return [...byNumber.values()]
    .filter((section) => !numbers.has(section.number))
    .map((section) => ({
      line: section.line,
      message: `milestone ${section.number} ha una sezione ma non è in tabella`,
    }))
}

export function findingsFor(source: string): Hit[] {
  const rows = statusRows(source)
  // Una roadmap ancora senza milestone è lo stato normale di un progetto appena nato.
  if (rows.length === 0) return []

  const byNumber = new Map(sections(source).map((s) => [s.number, s]))

  return [
    ...totalsAgree(rows, subtotals(source)),
    ...rowsAgree(rows, byNumber),
    ...sectionsAreListed(rows, byNumber),
  ].sort((a, b) => a.line - b.line)
}
