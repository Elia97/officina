#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { maskCommand, missingInput } from '../lib/cli.ts'
import { loadConfig, migrationUrlKey } from '../lib/config.ts'
import { fileMigrationEnv, type MigrationEnv, migrationEnv } from '../lib/migrate.ts'

const migrationFrom = (file: string | undefined, key: string): MigrationEnv =>
  file === undefined ? migrationEnv(process.env, key) : fileMigrationEnv(process.env, readFileSync(file, 'utf8'), key)

const where = (file: string | undefined): string =>
  file === undefined ? "sul branch di test, con l'indirizzo" : `con l'indirizzo di \`${file}\``

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = { script: { type: 'string' }, env: { type: 'string' } } as const
  const { script, env: file } = parseArgs({ args, options }).values
  if (!script) {
    console.error('\n✗ manca `--script`: il nome dello script delle migrazioni, per esempio `db:migrate`.\n')
    return 1
  }
  if (file !== undefined && missingInput(file, 'lo scrive vercel pull, prima delle migrazioni')) return 1
  const key = migrationUrlKey(await loadConfig(process.cwd()))
  const migration = migrationFrom(file, key)
  if ('error' in migration) {
    console.error(`\n✗ ${migration.error}.\n`)
    return 1
  }
  if (process.env.GITHUB_ACTIONS) console.log(maskCommand(migration.url))
  console.log(`\nmigrate — \`pnpm run ${script}\` ${where(file)} in \`${key}\`\n`)
  const { status, signal, error } = spawnSync('pnpm', ['run', script], { stdio: 'inherit', env: migration.env })
  if (error !== undefined) {
    console.error(`\n✗ pnpm non parte: ${error.message}.\n`)
    return 1
  }
  if (signal !== null) {
    console.error(`\n✗ \`pnpm run ${script}\` si è fermato per ${signal}.\n`)
    return 1
  }
  return status ?? 1
}

if (import.meta.main) process.exit(await main())
