#!/usr/bin/env node
import process from 'node:process'

type Main = (args?: string[]) => number | Promise<number>

// Un modulo per gate, caricato solo quando serve: `officina check routes` non paga il costo
// degli altri cinque.
const CHECKS: Record<string, () => Promise<{ main: Main }>> = {
  comments: () => import('./checks/comments.ts'),
  language: () => import('./checks/language.ts'),
  placeholders: () => import('./checks/placeholders.ts'),
  roadmap: () => import('./checks/roadmap.ts'),
  routes: () => import('./checks/routes.ts'),
  'vercel-cli': () => import('./checks/vercel-cli.ts'),
}

const USAGE = `Uso: officina check <gate> [opzioni]\n\nGate: ${Object.keys(CHECKS).join(', ')}\nOpzioni comuni: --diff, --base <ref>, --head <ref>, --strict, --format text|github\n`

export async function run(argv: string[]): Promise<number> {
  const [group, name, ...rest] = argv
  const load = group === 'check' && name !== undefined ? CHECKS[name] : undefined
  if (!load) {
    console.error(USAGE)
    return 2
  }
  const { main } = await load()
  return main(rest)
}

if (import.meta.main) process.exit(await run(process.argv.slice(2)))
