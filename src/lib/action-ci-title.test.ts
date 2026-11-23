import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { fakePnpm } from './test-helpers/fake-pnpm.ts'

interface Step {
  name?: string
  run?: string
  env?: Record<string, string>
}

const { runs } = parse(readFileSync(new URL('../../actions/ci/action.yml', import.meta.url), 'utf8')) as {
  runs: { steps: Step[] }
}

const expression = (body: string) => `\${{ ${body} }}`

const TITLE = runs.steps.find(({ name }) => name === 'Titolo della PR')

const FAKE_GH = `#!/usr/bin/env bash
echo "gh $*" >&2
[ -z "\${FAKE_GH_EXIT:-}" ] || exit "$FAKE_GH_EXIT"
printf '%s\\n' "$FAKE_GH_TITLE"
`

const BIN = fakePnpm()
writeFileSync(join(BIN, 'gh'), FAKE_GH, { mode: 0o755 })

afterAll(() => rmSync(BIN, { recursive: true, force: true }))

const step = (fake: Record<string, string>) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', TITLE?.run ?? ''], {
    encoding: 'utf8',
    env: { PATH: `${BIN}:${process.env.PATH}`, GH_TOKEN: 'token', PR: '42', REPO: 'Elia97/prova', ...fake },
  })

describe('il passo del titolo della PR in actions/ci', () => {
  it("legge il titolo dall'API con il token del job, non dal payload dell'evento", () => {
    expect(TITLE?.env).toEqual({
      GH_TOKEN: expression('github.token'),
      PR: expression('github.event.pull_request.number'),
      REPO: expression('github.repository'),
    })
    expect(TITLE?.run).not.toContain('pull_request.title')
  })

  it('passa il titolo a commitlint, che decide', () => {
    const { status, stdout, stderr } = step({ FAKE_GH_TITLE: 'feat(ci): il titolo nel job' })

    expect(status).toBe(0)
    expect(stderr).toBe('gh pr view 42 --repo Elia97/prova --json title --jq .title\n')
    expect(stdout.split('\n').slice(0, 2)).toEqual(['feat(ci): il titolo nel job', 'pnpm exec commitlint'])
  })

  it('con un titolo rifiutato esce 1 e dice come rilanciare dopo la correzione', () => {
    const { status, stdout } = step({ FAKE_GH_TITLE: 'sistemato tutto', FAKE_PNPM_EXIT: '1' })

    expect(status).toBe(1)
    expect(stdout).toContain('::error::il titolo della PR non rispetta le regole dei commit')
    expect(stdout).toContain('gh run rerun --failed')
  })

  it('se gh non legge la PR nomina il permesso e non lancia commitlint', () => {
    const { status, stdout } = step({ FAKE_GH_EXIT: '1' })

    expect(status).toBe(1)
    expect(stdout).toBe('::error::gh pr view non è riuscito: il workflow ha bisogno del permesso pull-requests: read\n')
  })
})
