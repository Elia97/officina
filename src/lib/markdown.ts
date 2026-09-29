// CommonMark § 4.5: recinto di tre o più ` o ~ (rientro fino a 3 spazi), chiuso da una riga dello stesso carattere,
// lunga almeno quanto l'apertura.
const FENCE = /^ {0,3}(`{3,}|~{3,})/
// CommonMark § 6.1: lo span si chiude alla prima stringa di apici inversi di pari lunghezza; una riga vuota lo interrompe.
const SPAN = /(?<!`)(`+)(?!`)((?:(?!\n[ \t]*\n)[\s\S])*?)(?<!`)\1(?!`)/g
// CommonMark § 6.3: destinazione fra <> o senza spazi (parentesi bilanciate, qui un solo livello); titolo fra "", '' o ().
const INLINE = /\]\(\s*(?:<([^>\n]*)>|((?:[^()\s\\]|\\.|\([^()\s]*\))*))(?:\s+(?:"[^"]*"|'[^']*'|\([^()]*\)))?\s*\)/g
const DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>\n]*)>|(\S+))/gm

export interface Destination {
  index: number
  destination: string
}

const spaces = (text: string): string => text.replace(/[^\n]/g, ' ')

export function blankFences(source: string): string {
  let fence: string | undefined
  return source
    .split('\n')
    .map((line) => {
      const run = FENCE.exec(line)?.[1]
      if (fence === undefined) {
        if (run === undefined) return line
        fence = run
      } else if (run !== undefined && run[0] === fence[0] && run.length >= fence.length && line.trim() === run) {
        fence = undefined
      }
      return spaces(line)
    })
    .join('\n')
}

export const blankSpans = (text: string): string => text.replace(SPAN, spaces)

const unescaped = (text: string): string => text.replace(/\\(.)/g, '$1')

function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export const linkDestinations = (text: string): Destination[] =>
  [...text.matchAll(INLINE), ...text.matchAll(DEFINITION)].map((match) => ({
    index: match.index,
    destination: decoded(unescaped((match[1] ?? match[2]) as string)),
  }))
