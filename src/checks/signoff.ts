#!/usr/bin/env node
import process from 'node:process'

import { signoff, signoffSources } from '../lib/signoff.ts'

export function main(args: string[] = []): number {
  if (args.length > 1) {
    console.error('\n✗ signoff — uso: officina signoff [ref], con un solo ref.\n')
    return 2
  }
  const { ok, message } = signoff(args[0] ?? 'HEAD', signoffSources())
  if (ok) console.log(`\n${message}\n`)
  else console.error(`\n${message}\n`)
  return ok ? 0 : 1
}

if (import.meta.main) process.exit(main(process.argv.slice(2)))
