import { describe, expect, it } from 'vitest'

import { runs, scope, started } from './test-helpers/action-ci-steps.ts'

const expression = (body: string) => `\${{ ${body} }}`
const position = (name: string): number => runs.steps.findIndex((step) => step.name === name)

const INTEGRATION = 'pnpm run test:integration'
const SKIPPED = ['Tipi generati di Astro', 'pnpm run ci']
const GATE = { 'steps.scope.outputs.docs-only': 'false', 'steps.scope.outputs.release-only': 'false' }

describe('actions/ci e il percorso del gate', () => {
  it('il passo della scelta legge gli stati del commit con il token del job, e sa se il progetto migra', () => {
    expect(runs.steps[scope]?.env).toEqual({
      GH_TOKEN: expression('github.token'),
      GH_REPO: expression('github.repository'),
      OFFICINA_MIGRATE: expression('inputs.migrate'),
    })
  })

  it('salta astro sync e pnpm run ci, e tiene il resto del percorso completo con i test di integrazione', () => {
    const full = started({ ...GATE, 'steps.scope.outputs.gate': 'false' })
    const gate = started({ ...GATE, 'steps.scope.outputs.gate': 'true' })

    expect(full).not.toContain(position(INTEGRATION))
    expect(gate).toEqual(
      [...full.filter((index) => !SKIPPED.map(position).includes(index)), position(INTEGRATION)].sort((a, b) => a - b),
    )
  })

  it('i test di integrazione girano dopo le migrazioni, e solo per un progetto che migra', () => {
    expect(position(INTEGRATION)).toBe(position('Migrazioni del branch di test') + 1)
    expect(runs.steps[position(INTEGRATION)]?.if).toBe(
      expression("inputs.migrate != '' && steps.scope.outputs.gate == 'true'"),
    )
    expect(started({ ...GATE, 'steps.scope.outputs.gate': 'true' }, { 'inputs.migrate': '' })).not.toContain(
      position(INTEGRATION),
    )
  })

  it('il job parte e prova la build e gli e2e anche sul gate: il check ci ha un esito vero, non un salto', () => {
    const gate = started({ ...GATE, 'steps.scope.outputs.gate': 'true' })
    const commands = gate.map((index) => runs.steps[index]?.run?.trim().split('\n').at(-1))

    expect(commands).toEqual(expect.arrayContaining(['pnpm run build', 'pnpm run test:e2e']))
  })
})
