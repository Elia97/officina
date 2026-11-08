import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { fakePnpm } from '../lib/test-helpers/fake-pnpm.ts'

const BIN = fileURLToPath(new URL('../bin.ts', import.meta.url))
const LOGS = 'node_modules/.cache/officina/gate'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(scripts?: Record<string, string>, files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-gate-'))
  dirs.push(root)
  if (scripts !== undefined) writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts }))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content, { mode: 0o755 })
  }
  return root
}

function gate(root: string, env: Record<string, string> = {}) {
  const bin = fakePnpm()
  dirs.push(bin)
  return spawnSync(process.execPath, [BIN, 'gate'], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, ...env },
  })
}

const log = (root: string, name: string) => readFileSync(join(root, LOGS, name), 'utf8')

describe('officina gate, il rapporto', () => {
  it('tutto verde: una riga per passo, poi la riga di esito, e un log per passo', () => {
    const root = project({ ci: 'echo uno && echo due', build: 'tsc' }, { [`${LOGS}/99-vecchio.log`]: '' })

    const { status, stdout, stderr } = gate(root)

    expect(status).toBe(0)
    expect(stderr).toBe('')
    const lines = stdout.split('\n').filter((line) => line !== '')
    expect(lines[0]).toBe('officina gate — 3 passi: i 2 di ci, build')
    expect(lines.slice(1, 4).map((line) => line.replace(/\s+\d+,\d s$/, ''))).toEqual([
      '  ✓ echo uno',
      '  ✓ echo due',
      '  ✓ build',
    ])
    expect(lines[4]).toMatch(/^ {2}Verde in \d+,\d s\.$/)
    expect(lines).toHaveLength(5)
    expect(log(root, '01-echo_uno.log')).toBe('uno\n')
    expect(log(root, '03-build.log')).toContain('pnpm run build')
    expect(existsSync(join(root, LOGS, '99-vecchio.log'))).toBe(false)
  })

  it("si ferma al primo rosso, ne stampa l'output senza colori ed esce con il suo codice", () => {
    const root = project(
      { ci: 'echo uno && sh rotto.sh && echo tre', build: 'tsc' },
      { 'rotto.sh': "printf '\\033[31mrotto\\033[0m   \\n' >&2\nexit 3\n" },
    )

    const { status, stdout } = gate(root)

    expect(status).toBe(3)
    expect(stdout).toMatch(/ {2}✗ sh rotto\.sh\s+\d+,\d s\n\n {2}rotto\n\n/)
    expect(stdout).toContain('  Fermo su sh rotto.sh: 2 passi non lanciati.\n')
    expect(stdout).toContain(`  Log completo: ${LOGS}/02-sh_rotto.sh.log\n`)
    expect(stdout).not.toContain('echo tre')
    expect(stdout).not.toContain('Verde')
    expect(log(root, '02-sh_rotto.sh.log')).toBe('rotto\n')
    expect(existsSync(join(root, LOGS, '03-echo_tre.log'))).toBe(false)
  })
})

describe('officina gate, dove lancia e quando non lancia', () => {
  it('trova i binari del progetto, come `pnpm run`', () => {
    const root = project({ ci: 'strumento' }, { 'node_modules/.bin/strumento': '#!/bin/sh\necho dal progetto\n' })

    const { status } = gate(root)

    expect(status).toBe(0)
    expect(log(root, '01-strumento.log')).toBe('dal progetto\n')
  })

  it('il codice di uscita di pnpm arriva fino in fondo', () => {
    const { status, stdout } = gate(project({ ci: 'echo uno', build: 'tsc' }), { FAKE_PNPM_EXIT: '2' })

    expect(status).toBe(2)
    expect(stdout).toContain('  ✗ build')
    expect(stdout).not.toContain('Fermo su')
  })

  it('senza `ci`, o senza package.json, non lancia niente ed esce 1', () => {
    const noCi = gate(project({ build: 'tsc' }))
    const noManifest = gate(project())

    expect(noCi.status).toBe(1)
    expect(noCi.stderr).toContain('✗ gate — `package.json` non ha lo script `ci`.')
    expect(noManifest.status).toBe(1)
    expect(noManifest.stderr).toContain('non si legge nella cartella corrente')
    expect(noCi.stdout + noManifest.stdout).toBe('')
  })
})
