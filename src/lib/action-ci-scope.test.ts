import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { fakePnpm } from './test-helpers/fake-pnpm.ts'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
}

const { runs } = parse(readFileSync(new URL('../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

const expression = (body: string) => `\${{ ${body} }}`
const FULL_RUN = /^\$\{\{ (?:[^|]+ && )?steps\.scope\.outputs\.docs-only != 'true' \}\}$/

const index = (wanted: (step: Step) => boolean): number => runs.steps.findIndex(wanted)
const scope = index(({ id }) => id === 'scope')
const documents = index(({ name }) => name === 'Controlli dei documenti')

const BIN = fakePnpm()

afterAll(() => rmSync(BIN, { recursive: true, force: true }))

describe('actions/ci e il percorso veloce dei documenti', () => {
  it("sceglie il percorso subito dopo l'install, negli output del passo", () => {
    expect(scope).toBe(index(({ run }) => run?.trim() === 'pnpm install --frozen-lockfile') + 1)
    expect(runs.steps[scope]?.run).toContain('pnpm exec officina scope >> "$GITHUB_OUTPUT"')
  })

  it('se officina scope fallisce lo dice e lascia il percorso completo, senza fermare il job', () => {
    const script = runs.steps[scope]?.run ?? ''
    const { status, stdout } = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], {
      encoding: 'utf8',
      env: { PATH: `${BIN}:${process.env.PATH}`, GITHUB_OUTPUT: '/dev/null', FAKE_PNPM_EXIT: '2' },
    })

    expect(status).toBe(0)
    expect(stdout).toContain('::warning::officina scope non è riuscito: si fa il percorso completo')
  })

  it('sul percorso veloce lancia soltanto i controlli dei documenti e doctor', () => {
    expect(runs.steps[documents]?.if).toBe(expression("steps.scope.outputs.docs-only == 'true'"))
    expect(runs.steps[documents]?.run?.trim().split('\n')).toEqual([
      'pnpm run check:language',
      'pnpm run check:routes',
      'pnpm run check:roadmap',
      'pnpm run doctor',
    ])
  })

  it('ogni altro passo dopo la scelta gira solo sul percorso completo, anche con la sua condizione', () => {
    const rest = runs.steps.filter((_, position) => position > scope && position !== documents)

    expect(rest.length).toBeGreaterThan(0)
    for (const step of rest) expect(step.if).toMatch(FULL_RUN)
  })
})
