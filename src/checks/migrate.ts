#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { loadConfig, migrationUrlKey } from '../lib/config.ts'
import { migrationEnv } from '../lib/migrate.ts'

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const { script } = parseArgs({ args, options: { script: { type: 'string' } } }).values
  if (!script) {
    console.error('\n✗ manca `--script`: il nome dello script delle migrazioni, per esempio `db:migrate`.\n')
    return 1
  }
  const key = migrationUrlKey(await loadConfig(process.cwd()))
  const migration = migrationEnv(process.env, key)
  if ('error' in migration) {
    console.error(`\n✗ ${migration.error}.\n`)
    return 1
  }
  console.log(`\nmigrate — \`pnpm run ${script}\` sul branch di test, con l'indirizzo in \`${key}\`\n`)
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
