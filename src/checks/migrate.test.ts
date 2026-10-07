import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import { fakePnpm } from '../lib/test-helpers/fake-pnpm.ts'

const BIN = fileURLToPath(new URL('../bin.ts', import.meta.url))
const TEST_URL = 'postgres://prova@ep-test.neon.tech/neondb'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function project(config?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-migrate-'))
  dirs.push(root)
  if (config !== undefined) writeFileSync(join(root, 'officina.config.mjs'), config)
  return root
}

function migrate(root: string, env: Record<string, string>) {
  const bin = fakePnpm()
  dirs.push(bin)
  return spawnSync(process.execPath, [BIN, 'migrate', '--script', 'db:migrate'], {
    cwd: root,
    encoding: 'utf8',
    env: { PATH: `${bin}:${process.env.PATH}`, ...env },
  })
}

const header = (key: string) =>
  `\nmigrate — \`pnpm run db:migrate\` sul branch di test, con l'indirizzo in \`${key}\`\n\n`

describe('officina migrate', () => {
  it("lancia lo script con l'indirizzo in DATABASE_URL_UNPOOLED, e nient'altro di nuovo", () => {
    const { status, stdout, stderr } = migrate(project(), { TEST_DATABASE_URL: TEST_URL })

    expect(status).toBe(0)
    expect(stdout).toBe(`${header('DATABASE_URL_UNPOOLED')}pnpm run db:migrate\nDATABASE_URL_UNPOOLED=${TEST_URL}\n`)
    expect(stderr).toBe('')
  })

  it('usa la chiave di `database.migrationUrlKey`', () => {
    const config = "export default { database: { migrationUrlKey: 'MIGRATION_URL' } }\n"

    const { status, stdout } = migrate(project(config), { TEST_DATABASE_URL: TEST_URL })

    expect(status).toBe(0)
    expect(stdout).toBe(`${header('MIGRATION_URL')}pnpm run db:migrate\nMIGRATION_URL=${TEST_URL}\n`)
  })

  it("senza l'indirizzo non lancia lo script, ed esce 1", () => {
    const { status, stdout, stderr } = migrate(project(), {})

    expect(status).toBe(1)
    expect(stderr).toContain('`TEST_DATABASE_URL` è vuota')
    expect(stdout).toBe('')
  })

  it('esce con il codice dello script', () => {
    const { status } = migrate(project(), { TEST_DATABASE_URL: TEST_URL, FAKE_PNPM_EXIT: '3' })

    expect(status).toBe(3)
  })

  it('dice perché lo script non arriva in fondo: pnpm che non parte, o un segnale', () => {
    const missing = migrate(project(), { TEST_DATABASE_URL: TEST_URL, PATH: '/nessuna-cartella' })
    const killed = migrate(project(), { TEST_DATABASE_URL: TEST_URL, FAKE_PNPM_SIGNAL: 'TERM' })

    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('✗ pnpm non parte: spawnSync pnpm ENOENT.')
    expect(killed.status).toBe(1)
    expect(killed.stderr).toContain('✗ `pnpm run db:migrate` si è fermato per SIGTERM.')
    expect(`${missing.stdout}${missing.stderr}${killed.stderr}`).not.toContain(TEST_URL)
  })
})
