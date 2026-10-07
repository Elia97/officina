#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { maskCommand } from '../lib/cli.ts'
import { loadConfig, migrationUrlKey } from '../lib/config.ts'
import { maskedValues, migrationEnv } from '../lib/migrate.ts'

const written = (stream: NodeJS.WritableStream, text: string): Promise<void> =>
  new Promise((resolve, reject) => {
    stream.write(text, (error) => (error ? reject(error) : resolve()))
  })

export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const options = { script: { type: 'string' }, production: { type: 'boolean' } } as const
  const { script, production } = parseArgs({ args, options }).values
  if (!script) {
    console.error('\n✗ manca `--script`: il nome dello script delle migrazioni, per esempio `db:migrate`.\n')
    return 1
  }
  const key = migrationUrlKey(await loadConfig(process.cwd()))
  const migration = migrationEnv(process.env, key, production ? 'production' : 'test')
  if ('error' in migration) {
    console.error(`\n✗ ${migration.error}.\n`)
    return 1
  }
  if (process.env.GITHUB_ACTIONS) {
    // Su una pipe piena libuv scrive il resto solo dopo `spawnSync`; il runner legge stderr prima di stdout
    // in ogni lotto di righe.
    const masks = `${maskedValues(migration.url).map(maskCommand).join('\n')}\n`
    await Promise.all([written(process.stdout, masks), written(process.stderr, masks)])
  }
  const where = production ? 'in produzione' : 'sul branch di test'
  console.log(`\nmigrate — \`pnpm run ${script}\` ${where}, con l'indirizzo in \`${key}\`\n`)
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
