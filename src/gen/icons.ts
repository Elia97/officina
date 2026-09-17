#!/usr/bin/env node
import process from 'node:process'

import { loadConfig } from '../lib/config.ts'

const isMissingSharp = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('sharp')

export async function main(): Promise<number> {
  const { icons } = await loadConfig(process.cwd())
  if (icons === undefined) {
    console.error('\n✗ officina.config.ts non dichiara icons.background: è il colore di fondo delle icone.\n')
    return 1
  }

  try {
    // Caricato qui e non in testa: sharp è del progetto, e chi non genera icone non lo deve avere.
    const { writeIcons } = await import('../lib/icons.ts')
    for (const { path, bytes } of await writeIcons(process.cwd(), icons.background)) {
      console.log(`${path}  ${(bytes / 1024).toFixed(1)} KB`)
    }
    return 0
  } catch (error) {
    if (!isMissingSharp(error)) throw error
    console.error('\n✗ sharp non è fra le dipendenze del progetto: `officina gen icons` lo usa per disegnare i PNG.\n')
    return 1
  }
}

if (import.meta.main) process.exit(await main())
