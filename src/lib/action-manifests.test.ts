import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { type Manifest, manifestFindings } from './action-manifests.ts'

const expression = (body: string) => `\${{ ${body} }}`

const one = (source: string) => manifestFindings([{ path: 'actions/prova/action.yml', source }])

const at = (line: number, message: string) => [{ path: 'actions/prova/action.yml', line, message }]

const NO_EXPRESSIONS = '`description` non ammette espressioni: il runner la valuta e il manifesto non si carica'

const invalidContext = (name: string) => `\`${name}\` non è un contesto di una composite action: passalo come input`

describe('le description', () => {
  it('non possono portare espressioni, perché il runner le valuta', () => {
    const line = `    description: 'Token Vercel — ${expression('secrets.VERCEL_TOKEN')}'`

    expect(one(`${line}\n`)).toEqual(at(1, NO_EXPRESSIONS))
  })

  it('con del testo soltanto non hanno niente che non va', () => {
    expect(one("    description: 'Token Vercel: passare il segreto VERCEL_TOKEN'\n")).toEqual([])
  })
})

describe('i contesti fuori dalle description', () => {
  it.each([
    ['        VERCEL_TOKEN: ', 'secrets.VERCEL_TOKEN', 'secrets'],
    ['      if: ', "needs.build.result == 'success'", 'needs'],
    ['        node: ', 'matrix.node', 'matrix'],
  ])('%s%s → %s non è di una composite action', (prefix, body, name) => {
    expect(one(`${prefix}${expression(body)}\n`)).toEqual(at(1, invalidContext(name)))
  })

  it.each([
    ['    value: ', 'steps.deploy.outputs.url'],
    ['        REQUESTED_REF: ', 'inputs.ref'],
    ['        key: ', 'runner.os'],
  ])('%s%s resta: è un contesto valido', (prefix, body) => {
    expect(one(`${prefix}${expression(body)}\n`)).toEqual([])
  })

  it('non guarda le righe commentate, che il runner non vede mai', () => {
    expect(one(`    # infilare ${expression('secrets.TOKEN')} qui sarebbe un errore\n`)).toEqual([])
  })

  it('riporta ogni espressione sbagliata della stessa riga', () => {
    const line = `        both: ${expression('secrets.A')} ${expression('matrix.b')}`

    expect(one(`${line}\n`)).toEqual([...at(1, invalidContext('secrets')), ...at(1, invalidContext('matrix'))])
  })
})

const ACTIONS = fileURLToPath(new URL('../../actions/', import.meta.url))

const manifests = (): Manifest[] =>
  readdirSync(ACTIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(entry.name, 'action.yml'))
    .sort()
    .map((name) => ({ path: `actions/${name}`, source: readFileSync(join(ACTIONS, name), 'utf8') }))

describe('i manifesti di questo repository', () => {
  it('sono quattro', () => {
    expect(manifests().map(({ path }) => path)).toEqual([
      'actions/ci/action.yml',
      'actions/deploy/action.yml',
      'actions/lighthouse/action.yml',
      'actions/review/action.yml',
    ])
  })

  it('si caricano: nessuna espressione dove il runner non la regge', () => {
    expect(manifestFindings(manifests())).toEqual([])
  })
})
