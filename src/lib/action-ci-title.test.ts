import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, describe, expect, it } from 'vitest'
import { parse } from 'yaml'

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

const FAKE_PNPM = `#!/usr/bin/env bash
echo "pnpm $*"
echo "commitlint riceve: $(cat)"
exit "\${FAKE_PNPM_EXIT:-0}"
`

const BIN = mkdtempSync(join(tmpdir(), 'officina-titolo-'))
writeFileSync(join(BIN, 'gh'), FAKE_GH, { mode: 0o755 })
writeFileSync(join(BIN, 'pnpm'), FAKE_PNPM, { mode: 0o755 })

afterAll(() => rmSync(BIN, { recursive: true, force: true }))

const step = (fake: Record<string, string>) =>
  spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', TITLE?.run ?? ''], {
    encoding: 'utf8',
    env: {
      PATH: `${BIN}:${process.env.PATH}`,
      GH_TOKEN: 'token',
      PR: '42',
      REPO: 'Elia97/prova',
      AUTHOR: 'Elia97',
      ...fake,
    },
  })

describe('il passo del titolo della PR in actions/ci', () => {
  it("legge il titolo dall'API con il token del job, non dal payload dell'evento", () => {
    expect(TITLE?.env).toEqual({
      GH_TOKEN: expression('github.token'),
      PR: expression('github.event.pull_request.number'),
      REPO: expression('github.repository'),
      AUTHOR: expression('github.event.pull_request.user.login'),
    })
    expect(TITLE?.run).not.toContain('pull_request.title')
  })

  it('passa il titolo a commitlint, che decide', () => {
    const { status, stdout, stderr } = step({ FAKE_GH_TITLE: 'feat(ci): il titolo nel job' })

    expect(status).toBe(0)
    expect(stderr).toBe('gh pr view 42 --repo Elia97/prova --json title --jq .title\n')
    expect(stdout).toBe(
      'feat(ci): il titolo nel job\npnpm exec commitlint\ncommitlint riceve: feat(ci): il titolo nel job\n',
    )
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

describe('le PR di Dependabot nel passo del titolo', () => {
  const BUMP = 'chore(deps): Bump astro from 5.1.0 to 5.2.0'

  it("a commitlint porta minuscola la prima lettera dell'oggetto di una PR di Dependabot", () => {
    const { status, stdout } = step({ FAKE_GH_TITLE: BUMP, AUTHOR: 'dependabot[bot]' })

    expect(status).toBe(0)
    expect(stdout).toContain(`${BUMP}\n`)
    expect(stdout).toContain('commitlint riceve: chore(deps): bump astro from 5.1.0 to 5.2.0\n')
  })

  it('da un altro autore lo stesso titolo arriva a commitlint invariato', () => {
    const { stdout } = step({ FAKE_GH_TITLE: BUMP })

    expect(stdout).toContain(`commitlint riceve: ${BUMP}\n`)
  })

  it('un titolo di Dependabot senza tipo arriva invariato, e il rifiuto di commitlint ferma il passo', () => {
    const { status, stdout } = step({
      FAKE_GH_TITLE: 'Bump astro from 5.1.0 to 5.2.0',
      AUTHOR: 'dependabot[bot]',
      FAKE_PNPM_EXIT: '1',
    })

    expect(status).toBe(1)
    expect(stdout).toContain('commitlint riceve: Bump astro from 5.1.0 to 5.2.0\n')
    expect(stdout).toContain('::error::il titolo della PR non rispetta le regole dei commit')
  })
})
