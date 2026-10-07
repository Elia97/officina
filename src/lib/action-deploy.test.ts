import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { fakePnpm } from './test-helpers/fake-pnpm.ts'

const DEPLOY = fileURLToPath(new URL('../../actions/deploy', import.meta.url))
const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
const STEP = "Stessa versione di officina nel tag e nell'action"
const MIGRATIONS = 'Migrazioni della produzione'

interface Step {
  name?: string
  if?: string
  shell?: string
  run?: string
  env?: Record<string, string>
}

const { inputs, runs } = parse(readFileSync(join(DEPLOY, 'action.yml'), 'utf8')) as {
  inputs: Record<string, unknown>
  runs: { steps: Step[] }
}

const expression = (body: string) => `\${{ ${body} }}`

function named(name: string): Step {
  const step = runs.steps.find((candidate) => candidate.name === name)
  if (step === undefined) throw new Error(`il passo «${name}» non c'è in actions/deploy/action.yml`)
  return step
}

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function checkout(installed?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-deploy-'))
  roots.push(root)
  if (installed !== undefined) {
    const dir = join(root, 'node_modules/@elia97/officina')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@elia97/officina', version: installed }))
  }
  return root
}

// La shell di un passo `shell: bash` su GitHub Actions: bash --noprofile --norc -eo pipefail {0}.
const shell = (name: string, cwd: string, env: Record<string, string>) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', named(name).run ?? ''], {
    cwd,
    encoding: 'utf8',
    env,
  })

const step = (cwd: string) => shell(STEP, cwd, { ...process.env, GITHUB_ACTION_PATH: DEPLOY, TARGET_REF: 'v1.2.3' })

describe('il deploy e la versione di officina che il tag installa', () => {
  it("prosegue in silenzio quando è quella dell'action", () => {
    const { status, stdout } = step(checkout(VERSION))

    expect(status).toBe(0)
    expect(stdout).toBe('')
  })

  it('si ferma su un tag con un altro officina, e dice le due versioni e le due strade', () => {
    const { status, stdout } = step(checkout('0.6.0'))

    expect(status).toBe(1)
    expect(stdout).toContain(`::error::v1.2.3 installa officina 0.6.0, e questa action è la ${VERSION}`)
    expect(stdout).toContain('«Use workflow from»')
  })

  it('si ferma su un tag che non installa officina', () => {
    const { status, stdout } = step(checkout())

    expect(status).toBe(1)
    expect(stdout).toContain(`::error::v1.2.3 non installa @elia97/officina, e questa action è la ${VERSION}`)
  })
})

const position = (matches: (run: string) => boolean): number =>
  runs.steps.findIndex(({ run }) => run !== undefined && matches(run))

const BIN = fakePnpm()

afterAll(() => rmSync(BIN, { recursive: true, force: true }))

describe('il deploy e le migrazioni', () => {
  it('le applica dopo `vercel pull` e il controllo del suo file, prima della build, solo quando il progetto dichiara `migrate`', () => {
    const order = [
      position((run) => /^pnpm dlx vercel@\S+ pull\b/.test(run)),
      position((run) => run === 'pnpm run check:placeholders --env .vercel/.env.production.local'),
      runs.steps.indexOf(named(MIGRATIONS)),
      position((run) => /^pnpm dlx vercel@\S+ build --prod$/.test(run)),
    ]

    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(named(MIGRATIONS).if).toBe(expression("inputs.migrate != ''"))
    expect(inputs.migrate).toMatchObject({ required: false, default: '' })
  })

  it('`inputs.migrate` entra solo in quel passo, che non riceve il token di Vercel e non va avanti dopo un errore', () => {
    const receiving = runs.steps.filter((candidate) => JSON.stringify(candidate).includes('inputs.migrate'))

    expect(receiving.map(({ name }) => name)).toEqual([MIGRATIONS])
    expect(named(MIGRATIONS)).toEqual({
      name: MIGRATIONS,
      if: expression("inputs.migrate != ''"),
      shell: 'bash',
      env: { MIGRATE: expression('inputs.migrate') },
      run: 'pnpm exec officina migrate --env .vercel/.env.production.local --script "$MIGRATE"',
    })
  })

  it('la shell lancia officina migrate sul file di vercel pull, con lo script del progetto', () => {
    const { status, stdout } = shell(MIGRATIONS, checkout(), {
      PATH: `${BIN}:${process.env.PATH}`,
      MIGRATE: 'db:migrate',
    })

    expect(status).toBe(0)
    expect(stdout).toBe(
      'pnpm exec officina migrate --env .vercel/.env.production.local --script db:migrate\nMIGRATE=db:migrate\n',
    )
  })

  it('se le migrazioni falliscono, il passo fallisce e il deploy si ferma', () => {
    const { status } = shell(MIGRATIONS, checkout(), {
      PATH: `${BIN}:${process.env.PATH}`,
      MIGRATE: 'db:migrate',
      FAKE_PNPM_EXIT: '1',
    })

    expect(status).toBe(1)
  })
})
