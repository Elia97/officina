#!/usr/bin/env node
import process from 'node:process'

type Main = (args?: string[]) => number | Promise<number>
type Loader = () => Promise<{ main: Main }>

// Un modulo per gate, caricato solo quando serve: `officina check routes` non paga il costo
// degli altri cinque.
export const CHECKS: Record<string, Loader> = {
  comments: () => import('./checks/comments.ts'),
  language: () => import('./checks/language.ts'),
  placeholders: () => import('./checks/placeholders.ts'),
  roadmap: () => import('./checks/roadmap.ts'),
  routes: () => import('./checks/routes.ts'),
  'vercel-cli': () => import('./checks/vercel-cli.ts'),
}

const USAGE = `Uso:
  officina check <gate> [opzioni]   gate: ${Object.keys(CHECKS).join(', ')}
  officina gen [generatore]         section, page, component, collection, più quelli del progetto
  officina doctor                   cosa manca al progetto perché i generatori funzionino

Opzioni dei gate: --diff, --base <ref>, --head <ref>, --strict, --format text|github
`

// Ogni gruppo dice quale modulo carica e quali argomenti gli passa.
const GROUPS: Record<string, (args: string[]) => { load: Loader | undefined; args: string[] }> = {
  check: ([name = '', ...rest]) => ({ load: CHECKS[name], args: rest }),
  gen: (args) => ({ load: () => import('./gen/run.ts'), args }),
  doctor: (args) => ({ load: () => import('./checks/doctor.ts'), args }),
}

export async function run(argv: string[]): Promise<number> {
  const [group = '', ...rest] = argv
  const { load, args } = GROUPS[group]?.(rest) ?? { load: undefined, args: [] }
  if (!load) {
    console.error(USAGE)
    return 2
  }
  const { main } = await load()
  return main(args)
}

/* v8 ignore next -- eseguito solo quando il file è il punto d'ingresso del processo */
if (import.meta.main) process.exit(await run(process.argv.slice(2)))
