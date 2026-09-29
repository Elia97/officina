import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const DEPLOY = fileURLToPath(new URL('../../actions/deploy', import.meta.url))
const VERSION: string = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version
const STEP = "Stessa versione di officina nel tag e nell'action"

interface Step {
  name?: string
  run?: string
}

function script(): string {
  const { runs } = parse(readFileSync(join(DEPLOY, 'action.yml'), 'utf8')) as { runs: { steps: Step[] } }
  const run = runs.steps.find(({ name }) => name === STEP)?.run
  if (run === undefined) throw new Error(`il passo «${STEP}» non c'è in actions/deploy/action.yml`)
  return run
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
const step = (cwd: string) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script()], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTION_PATH: DEPLOY, TARGET_REF: 'v1.2.3' },
  })

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
