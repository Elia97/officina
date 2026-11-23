import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Step {
  name?: string
  id?: string
  if?: string
  run?: string
  uses?: string
  with?: Record<string, string>
}

const { runs } = parse(readFileSync(new URL('../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

const expression = (body: string) => `\${{ ${body} }}`
const FULL_RUN =
  /^\$\{\{ (?:[^|]+ && )?steps\.scope\.outputs\.docs-only != 'true' && steps\.scope\.outputs\.release-only != 'true' \}\}$/
const NOT_RELEASE = /^\$\{\{ (?:[^|]+ && )?steps\.scope\.outputs\.release-only != 'true' \}\}$/

const index = (wanted: (step: Step) => boolean): number => runs.steps.findIndex(wanted)
const scope = index(({ id }) => id === 'scope')
const documents = index(({ name }) => name === 'Controlli dei documenti')
const install = index(({ run }) => run?.trim() === 'pnpm install --frozen-lockfile')
const title = index(({ name }) => name === 'Titolo della PR')
const setupNode = runs.steps.flatMap((step, position) =>
  step.uses?.startsWith('actions/setup-node@') ? [position] : [],
)
const beforeChecks = [setupNode[1] ?? -1, install, title]
const afterScope = runs.steps.filter((_, position) => position > scope)

// Le condizioni dell'action sono termini `a == 'x'` o `a != 'x'` uniti da `&&`: basta questo per valutarle.
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
const started = (outputs: Record<string, string>, event: Record<string, string> = {}) =>
  afterScope
    .filter((step) => runsWith(step, { ...INPUTS, ...event, ...outputs }))
    .map((step) => runs.steps.indexOf(step))

const ACTION_DIR = fileURLToPath(new URL('../../actions/ci', import.meta.url))
const scopeScript = runs.steps[scope]?.run ?? ''

const TEMP = mkdtempSync(join(tmpdir(), 'officina-scope-'))
const OUTPUT = join(TEMP, 'github-output')

const runScope = (actionPath: string, cwd: string) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', scopeScript], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_ACTION_PATH: actionPath, GITHUB_OUTPUT: OUTPUT },
  })

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(/^import [^'"]*['"]([^'"]+)['"]/gm)].map(([, from = '']) => from)
}

function moduleGraph(file: string, seen = new Set<string>()): string[] {
  if (seen.has(file)) return []
  seen.add(file)
  return importsOf(file).flatMap((from) =>
    from.startsWith('.') ? moduleGraph(resolve(dirname(file), from), seen) : [from],
  )
}

afterAll(() => rmSync(TEMP, { recursive: true, force: true }))

describe("actions/ci sceglie il percorso prima dell'install", () => {
  it('subito dopo il primo setup-node, che non chiede la cache di pnpm', () => {
    expect(scope).toBe((setupNode[0] ?? -2) + 1)
    expect(runs.steps[setupNode[0] ?? -1]?.with).toEqual({ 'node-version-file': '.nvmrc' })
    expect(scope).toBeLessThan(install)
  })

  it("con lo scope.ts del tag dell'action, che importa solo moduli di Node", () => {
    expect(scopeScript).toContain('node "$GITHUB_ACTION_PATH/../../src/checks/scope.ts" >> "$GITHUB_OUTPUT"')
    const external = moduleGraph(resolve(ACTION_DIR, '../../src/checks/scope.ts'))

    expect(external.length).toBeGreaterThan(0)
    expect(external.filter((from) => !from.startsWith('node:'))).toEqual([])
  })

  it('lo scope.ts gira con node da una cartella senza node_modules', () => {
    spawnSync('git', ['init', '-q'], { cwd: TEMP })
    writeFileSync(OUTPUT, '')
    const { status } = runScope(ACTION_DIR, TEMP)

    expect(status).toBe(0)
    expect(readFileSync(OUTPUT, 'utf8')).toBe('docs-only=false\nrelease-only=false\n')
  })

  it('se lo scope fallisce lo dice e lascia il percorso completo, senza fermare il job', () => {
    const { status, stdout } = runScope(join(TEMP, 'non-esiste'), TEMP)

    expect(status).toBe(0)
    expect(stdout).toContain('::warning::officina scope non è riuscito: si fa il percorso completo')
  })

  it("il setup-node con la cache, l'install e il titolo saltano solo sulla release", () => {
    expect(runs.steps[setupNode[1] ?? -1]?.with).toEqual({ 'node-version-file': '.nvmrc', cache: 'pnpm' })
    for (const position of beforeChecks) expect(runs.steps[position]?.if).toMatch(NOT_RELEASE)
    expect(runs.steps[title]?.if).toBe(
      expression("github.event_name == 'pull_request' && steps.scope.outputs.release-only != 'true'"),
    )
  })
})

describe('actions/ci e il percorso veloce dei documenti', () => {
  it('sul percorso veloce lancia soltanto i controlli dei documenti e doctor', () => {
    expect(runs.steps[documents]?.if).toBe(expression("steps.scope.outputs.docs-only == 'true'"))
    expect(runs.steps[documents]?.run?.trim().split('\n')).toEqual([
      'pnpm run check:language',
      'pnpm run check:routes',
      'pnpm run check:roadmap',
      'pnpm run doctor',
    ])
  })

  it('ogni altro passo dopo la preparazione gira solo sul percorso completo, anche con la sua condizione', () => {
    const rest = afterScope.filter(
      (step) => step !== runs.steps[documents] && !beforeChecks.includes(runs.steps.indexOf(step)),
    )

    expect(rest.length).toBeGreaterThan(0)
    for (const step of rest) expect(step.if).toMatch(FULL_RUN)
  })
})

describe('actions/ci sui tre percorsi', () => {
  it('sulla PR di release non parte nessun passo dopo la scelta, e il check resta verde', () => {
    expect(started({ 'steps.scope.outputs.docs-only': 'false', 'steps.scope.outputs.release-only': 'true' })).toEqual(
      [],
    )
  })

  it('sui soli documenti partono la preparazione, il titolo e i loro controlli', () => {
    expect(started({ 'steps.scope.outputs.docs-only': 'true', 'steps.scope.outputs.release-only': 'false' })).toEqual([
      ...beforeChecks,
      documents,
    ])
  })

  it('sul percorso completo parte ogni passo tranne quello dei documenti, anche con un officina che non scrive release-only', () => {
    const full = afterScope.map((step) => runs.steps.indexOf(step)).filter((position) => position !== documents)

    expect(started({ 'steps.scope.outputs.docs-only': 'false', 'steps.scope.outputs.release-only': 'false' })).toEqual(
      full,
    )
    expect(started({ 'steps.scope.outputs.docs-only': 'false' })).toEqual(full)
  })

  it('fuori da una PR il titolo non si controlla', () => {
    const outputs = { 'steps.scope.outputs.docs-only': 'false', 'steps.scope.outputs.release-only': 'false' }

    expect(started(outputs, { 'github.event_name': 'push' })).not.toContain(title)
  })
})
