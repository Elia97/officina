import { type Hit, readLines } from './cli.ts'
import { isLive } from './workflows.ts'

export interface Manifest {
  path: string
  source: string
}

export interface ManifestHit extends Hit {
  path: string
}

const EXPRESSION = /\$\{\{[^}]*\}\}/g
const DESCRIPTION = /^\s*description:/
const FORBIDDEN: readonly string[] = ['secrets', 'needs', 'matrix']

const contextIn = (expression: string): string | undefined =>
  FORBIDDEN.find((name) => new RegExp(`(^|[^\\w.])${name}\\.`).test(expression))

function lineFindings(text: string): string[] {
  const expressions = [...text.matchAll(EXPRESSION)]
  if (expressions.length === 0) return []
  if (DESCRIPTION.test(text)) {
    return ['`description` non ammette espressioni: il runner la valuta e il manifesto non si carica']
  }
  return expressions.flatMap(([expression]) => {
    const context = contextIn(expression)
    return context === undefined ? [] : [`\`${context}\` non è un contesto di una composite action: passalo come input`]
  })
}

// Il runner valuta le espressioni del manifesto prima di eseguire qualunque passo: un contesto che una
// composite action non conosce non è un valore vuoto, è un'action che non si carica.
export function manifestFindings(manifests: readonly Manifest[]): ManifestHit[] {
  return manifests.flatMap(({ path, source }) =>
    readLines(source)
      .filter(({ text }) => isLive(text))
      .flatMap(({ n, text }) => lineFindings(text).map((message) => ({ path, line: n, message }))),
  )
}
