import type { Hit } from './cli.ts'
import { type CommentBlock, commentBlocks, type Line, styleOf } from './comment-syntax.ts'
import { PAST_TENSE } from './past-tense.ts'

export interface FileReport {
  findings: Hit[]
  comments: number
  total: number
}

const MAX_PROSE_LINES = 2
const NOISY_RATIO = 0.15
const MIN_LINES_FOR_RATIO = 40

// Direttive per strumenti: non sono prosa, non contano nella lunghezza del blocco né per il
// tempo verbale.
const KEEP =
  /biome-ignore|@ts-|\/\/\/\s*<reference|@vitest-environment|@vite-ignore|fallow-ignore|v8 ignore|c8 ignore|istanbul ignore|#__PURE__|SPDX-License-Identifier|TODO|FIXME|\[HARD\]|@public|@internal|@deprecated|^#!/

// Righe fatte solo di delimitatori: aprono o chiudono un blocco senza dire niente.
const DELIMITER_ONLY = /^(?:\/\*+|\*+\/|\*|\{\/\*+|\*+\/\}|<!--|-->)$/

// Fuori: i file in cui il commento *è* il contenuto — in `.env.example` e `.npmrc` ogni riga
// di prosa documenta la chiave sotto di sé.
export const SCANNED = /\.(ts|tsx|astro|mjs|cjs|js|css|ya?ml|sh)$/

const isProse = (line: Line) => !DELIMITER_ONLY.test(line.text.trim()) && !KEEP.test(line.text)

// Un marcatore esenta la propria riga, mai il blocco: un solo `[HARD]` in mezzo comprerebbe
// al commento lunghezza illimitata.
function blockFinding(block: CommentBlock): Hit | null {
  if (block.trailing) return null
  const [first] = block.lines
  const prose = block.lines.filter(isProse).length
  if (!first || prose <= MAX_PROSE_LINES) return null
  return {
    line: first.n,
    message: `blocco di ${prose} righe di prosa (max ${MAX_PROSE_LINES})`,
  }
}

function pastTenseFinding(line: Line): Hit | null {
  if (KEEP.test(line.text)) return null
  if (!PAST_TENSE.some((re) => re.test(line.text))) return null
  return {
    line: line.n,
    message: `racconta il cambiamento: ${line.text.trim().slice(0, 60)}`,
  }
}

export function report(file: string, lines: Line[]): FileReport {
  const findings: Hit[] = []
  let comments = 0

  for (const block of commentBlocks(lines, styleOf(file))) {
    if (!block.trailing) comments += block.lines.length
    const long = blockFinding(block)
    if (long) findings.push(long)
    for (const line of block.lines) {
      const narrated = pastTenseFinding(line)
      if (narrated) findings.push(narrated)
    }
  }

  findings.sort((a, b) => a.line - b.line)
  return { findings, comments, total: lines.length }
}

export function isNoisy({ comments, total }: FileReport): boolean {
  return total >= MIN_LINES_FOR_RATIO && comments / total > NOISY_RATIO
}
