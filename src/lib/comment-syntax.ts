export interface Line {
  n: number
  text: string
}

// Un commento in coda a una riga di codice non forma mai un blocco, ma il suo testo conta
// per le altre regole.
export interface CommentBlock {
  lines: Line[]
  trailing: boolean
}

const HASH_STYLE = /\.(ya?ml|sh)$/
const CSS_STYLE = /\.css$/
const ASTRO_STYLE = /\.astro$/

export type CommentStyle = 'hash' | 'css' | 'slash' | 'astro'

export function styleOf(file: string): CommentStyle {
  if (HASH_STYLE.test(file)) return 'hash'
  if (CSS_STYLE.test(file)) return 'css'
  return ASTRO_STYLE.test(file) ? 'astro' : 'slash'
}

// Ritorna [chiusura attesa, lunghezza dell'apertura] se la riga apre un commento; chiusura
// vuota per i commenti a riga singola.
function opener(s: string, style: CommentStyle): [closer: string, skip: number] | null {
  if (style === 'hash') return s.startsWith('#') && !s.startsWith('#!') ? ['', 1] : null
  if (style !== 'css' && s.startsWith('//')) return ['', 2]
  if (s.startsWith('{/*')) return ['*/}', 3]
  if (s.startsWith('/*')) return ['*/', 2]
  if (style === 'astro' && s.startsWith('<!--')) return ['-->', 4]
  return null
}

// Gli indici dei caratteri che stanno fuori da una stringa. Percorrere la riga è l'unico modo:
// contare le virgolette non regge un apostrofo ("L'esperienza") né un escape.
function* outsideStrings(text: string): Generator<number> {
  let quote = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }
    // Fuori dalle stringhe un backslash sta solo nelle regex: "\\/\\/" non è un commento.
    if (ch === '\\') {
      i++
      continue
    }
    yield i
  }
}

// In YAML e shell "#" apre un commento solo dopo uno spazio: "url#frag" è un valore.
const opensComment = (text: string, i: number, style: CommentStyle): boolean =>
  style === 'hash'
    ? text.charAt(i) === '#' && /\s/.test(text.charAt(i - 1))
    : text.charAt(i) === '/' && (text[i + 1] === '/' || text[i + 1] === '*')

// Il commento in coda a una riga di codice, se c'è.
function trailingComment(text: string, style: CommentStyle): string | null {
  if (style === 'css') return null
  for (const i of outsideStrings(text)) if (i > 0 && opensComment(text, i, style)) return text.slice(i)
  return null
}

export function commentBlocks(lines: Line[], style: CommentStyle): CommentBlock[] {
  const blocks: CommentBlock[] = []
  let current: Line[] = []
  let closer = ''

  const flush = () => {
    if (current.length > 0) blocks.push({ lines: current, trailing: false })
    current = []
  }

  for (const line of lines) {
    const s = line.text.trim()

    if (closer) {
      current.push(line)
      if (s.includes(closer)) closer = ''
      continue
    }

    const opened = opener(s, style)
    if (opened) {
      const [expected, skip] = opened
      current.push(line)
      if (expected && s.indexOf(expected, skip) === -1) closer = expected
      continue
    }

    flush()
    const trailing = trailingComment(line.text, style)
    if (trailing) blocks.push({ lines: [{ n: line.n, text: trailing }], trailing: true })
  }
  flush()
  return blocks
}
