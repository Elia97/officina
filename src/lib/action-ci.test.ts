import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

interface Step {
  run?: string
}

const { runs } = parse(readFileSync(new URL('../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

const position = (command: string): number => runs.steps.findIndex(({ run }) => run?.trim() === command)

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
