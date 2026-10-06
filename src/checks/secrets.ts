#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { cliOptions, exitCode, missingInput, printFindings } from '../lib/cli.ts'
import { envSchema } from '../lib/env-schema.ts'
import { filesWithExtension } from '../lib/routes.ts'
import { canaryLines, scanSecrets, secretFields } from '../lib/secrets.ts'

const SCHEMA = 'astro.config.mjs'
const DIST = 'dist/client'
const ADVICE =
  'Una chiave server e secret si legge solo nel codice che gira sul server: segui la strada che la porta nel file nominato'

function check(keys: readonly string[]): number {
  const counted = keys.length === 1 ? '1 chiave' : `${keys.length} chiavi`
  console.log(`\ncheck:secrets — ${counted} server e secret di env.schema, cercate in ${DIST}\n`)
  if (keys.length === 0) {
    console.log('  Nessuna chiave segreta nello schema: niente da verificare.\n')
    return 0
  }
  if (missingInput(DIST, 'è la build in cui si cercano le chiavi: prima `pnpm build`')) return 1
  const files = filesWithExtension(DIST, '')
  if (files.length === 0) {
    console.error(`\n✗ ${DIST} è vuota: senza file il controllo non afferma niente.\n`)
    return 1
  }

  const { findings, verified } = scanSecrets(keys, process.env, files, (path) => readFileSync(path))
  printFindings(findings, cliOptions([]).format)
  if (verified.length > 0) console.log(`  Verificate: ${verified.join(', ')}.`)
  if (findings.some(({ severity }) => severity === 'error')) console.log(`\n  ${ADVICE}.\n`)
  return exitCode(findings, false)
}

export function main(args: string[] = process.argv.slice(2)): number {
  const { canaries } = parseArgs({ args, options: { canaries: { type: 'boolean', default: false } } }).values
  if (missingInput(SCHEMA, 'le chiavi segrete stanno nel suo `env.schema`')) return 1
  const secrets = secretFields(envSchema(readFileSync(SCHEMA, 'utf8')))
  if (!canaries) return check(secrets.map(({ key }) => key))
  for (const line of canaryLines(secrets)) console.log(line)
  return 0
}

if (import.meta.main) process.exit(main())
