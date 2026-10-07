import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { fakePnpm } from './test-helpers/fake-pnpm.ts'

interface Step {
  name?: string
  if?: string
  run?: string
  env?: Record<string, string>
}

const { runs } = parse(readFileSync(new URL('../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

const expression = (body: string) => `\${{ ${body} }}`

const command = ({ run }: Step): string | undefined => run?.trim().split('\n').at(-1)

const position = (wanted: string): number => runs.steps.findIndex((step) => command(step) === wanted)

function named(name: string): Step {
  const step = runs.steps.find((candidate) => candidate.name === name)
  if (step === undefined) throw new Error(`il passo «${name}» non c'è in actions/ci/action.yml`)
  return step
}

const MIGRATE = 'pnpm exec officina migrate --script "$MIGRATE"'
const MIGRATIONS = 'Migrazioni del branch di test'
const COMMANDS = ['pnpm run ci', 'pnpm run build', 'pnpm run check:secrets']

describe('actions/ci e i canary di check secrets', () => {
  it("li mette nell'ambiente dopo i test e prima della build, e cerca le chiavi quando la build è finita", () => {
    const order = [
      'pnpm run ci',
      'pnpm exec officina check secrets --canaries >> "$GITHUB_ENV"',
      'pnpm run build',
      'pnpm run --if-present check:secrets',
    ].map(position)

    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})

describe('actions/ci e il database di test', () => {
  it('migra il branch di test prima di `pnpm run ci`, solo quando il progetto dichiara `migrate`', () => {
    expect(position(MIGRATE)).toBeGreaterThanOrEqual(0)
    expect(position(MIGRATE)).toBeLessThan(position('pnpm run ci'))
    expect(named(MIGRATIONS).if).toBe(expression("inputs.migrate != ''"))
    expect(named(MIGRATIONS).env).toEqual({
      MIGRATE: expression('inputs.migrate'),
      TEST_DATABASE_URL: expression('inputs.database-url'),
    })
  })

  it("l'indirizzo entra solo in quattro passi, e nessun `if:` lo guarda", () => {
    const receiving = runs.steps.filter((step) => JSON.stringify(step).includes('inputs.database-url'))

    expect(receiving.map(({ name }) => name)).toEqual([MIGRATIONS, ...COMMANDS])
    expect(runs.steps.filter((step) => step.if?.includes('database-url'))).toEqual([])
  })

  it.each(COMMANDS)('«%s» lo riceve con un nome di officina, e la prima riga nomina il comando', (name) => {
    expect(named(name).env).toEqual({ OFFICINA_TEST_DATABASE_URL: expression('inputs.database-url') })
    expect(named(name).run?.split('\n')[0]).toBe(`# ${name}`)
  })
})

const TEST_URL = 'postgres://prova@ep-test.neon.tech/neondb'
const CANARY = 'officina-DATABASE_URL-canary'
const BIN = fakePnpm()
const INPUT = /^\$\{\{ inputs\.([\w-]+) \}\}$/

afterAll(() => rmSync(BIN, { recursive: true, force: true }))

function stepEnv({ env = {} }: Step, inputs: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => {
      const input = INPUT.exec(value)?.[1]
      if (input === undefined) throw new Error(`${key}: ${value} non è un input dell'action`)
      return [key, inputs[input] ?? '']
    }),
  )
}

// La shell di un passo `shell: bash` su GitHub Actions: bash --noprofile --norc -eo pipefail {0}.
// Il runner applica l'`env:` del passo sopra l'ambiente del job, e un input non passato vale ''.
const step = (name: string, inputs: Record<string, string>, job: Record<string, string> = {}) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', named(name).run ?? ''], {
    encoding: 'utf8',
    env: { PATH: `${BIN}:${process.env.PATH}`, ...job, ...stepEnv(named(name), inputs) },
  })

describe('la shell delle migrazioni', () => {
  it("con l'indirizzo lancia officina migrate con lo script del progetto", () => {
    const { status, stdout } = step(MIGRATIONS, { migrate: 'db:migrate', 'database-url': TEST_URL })

    expect(status).toBe(0)
    expect(stdout).toBe(
      `pnpm exec officina migrate --script db:migrate\nMIGRATE=db:migrate\nTEST_DATABASE_URL=${TEST_URL}\n`,
    )
  })

  it("con l'indirizzo vuoto lo dice e prosegue, senza lanciare niente", () => {
    const { status, stdout } = step(MIGRATIONS, { migrate: 'db:migrate' })

    expect(status).toBe(0)
    expect(stdout).toMatch(/^::notice::database-url è vuoto, [^\n]*i test di integrazione si saltano\n$/)
  })
})

const JOB = { DATABASE_URL: CANARY, TEST_DATABASE_URL: 'postgres://dal-job' }

describe.each([
  ['pnpm run ci', 'pnpm run ci', {}, 'TEST_DATABASE_URL'],
  ['pnpm run build', 'pnpm run build', { DATABASE_URL: CANARY }, 'DATABASE_URL'],
  ['pnpm run check:secrets', 'pnpm run --if-present check:secrets', { DATABASE_URL: CANARY }, 'DATABASE_URL'],
])('la shell di «%s»', (name, launched, before: Record<string, string>, as) => {
  it(`con l'indirizzo lo dà al comando come ${as}, e nient'altro`, () => {
    const { status, stdout } = step(name, { 'database-url': TEST_URL }, before)

    expect(status).toBe(0)
    expect(stdout).toBe(`${launched}\n${as}=${TEST_URL}\n`)
  })

  it("senza l'indirizzo lancia il comando con l'ambiente del job com'è", () => {
    const { status, stdout } = step(name, {}, JOB)

    expect(status).toBe(0)
    expect(stdout).toBe(`${launched}\nDATABASE_URL=${CANARY}\nTEST_DATABASE_URL=postgres://dal-job\n`)
  })
})
