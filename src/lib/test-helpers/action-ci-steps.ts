import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

export interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, string>
  env?: Record<string, string>
}

export const { runs } = parse(readFileSync(new URL('../../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

export const scope = runs.steps.findIndex(({ id }) => id === 'scope')

export const afterScope = runs.steps.filter((_, position) => position > scope)

function runsWith(step: Step, values: Record<string, string>): boolean {
  const body = step.if?.replace(/^\$\{\{ (.*) \}\}$/, '$1')
  if (body === undefined) return true
  return body.split(' && ').every((term) => {
    const [, name = '', operator, literal] = /^(\S+) (==|!=) '(.*)'$/.exec(term) ?? []
    if (operator === undefined) throw new Error(`condizione non prevista: ${term}`)
    return (values[name] === literal) === (operator === '==')
  })
}

const INPUTS = { 'inputs.e2e': 'true', 'inputs.migrate': 'db:migrate', 'github.event_name': 'pull_request' }

export const started = (outputs: Record<string, string>, event: Record<string, string> = {}) =>
  afterScope
    .filter((step) => runsWith(step, { ...INPUTS, ...event, ...outputs }))
    .map((step) => runs.steps.indexOf(step))
