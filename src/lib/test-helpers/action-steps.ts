import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

export const DEPLOY = fileURLToPath(new URL('../../../actions/deploy', import.meta.url))

export interface Step {
  name?: string
  if?: string
  shell?: string
  run?: string
  env?: Record<string, string>
}

export const { inputs, runs } = parse(readFileSync(join(DEPLOY, 'action.yml'), 'utf8')) as {
  inputs: Record<string, unknown>
  runs: { steps: Step[] }
}

export const expression = (body: string) => `\${{ ${body} }}`

export function named(name: string): Step {
  const step = runs.steps.find((candidate) => candidate.name === name)
  if (step === undefined) throw new Error(`il passo «${name}» non c'è in actions/deploy/action.yml`)
  return step
}

// La shell di un passo `shell: bash` su GitHub Actions: bash --noprofile --norc -eo pipefail {0}.
export const shell = (name: string, cwd: string, env: Record<string, string>) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', named(name).run ?? ''], {
    cwd,
    encoding: 'utf8',
    env,
  })
