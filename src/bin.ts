#!/usr/bin/env node
import process from 'node:process'

type Main = (args?: string[]) => number | Promise<number>
type Loader = () => Promise<{ main: Main }>

// Un modulo per gate, caricato solo quando serve: `officina check routes` non paga il costo
// degli altri.
export const CHECKS: Record<string, Loader> = {
  analytics: () => import('./checks/analytics.ts'),
  bundle: () => import('./checks/bundle.ts'),
  comments: () => import('./checks/comments.ts'),
  language: () => import('./checks/language.ts'),
  lighthouse: () => import('./checks/lighthouse.ts'),
  placeholders: () => import('./checks/placeholders.ts'),
  roadmap: () => import('./checks/roadmap.ts'),
  routes: () => import('./checks/routes.ts'),
  smoke: () => import('./checks/smoke.ts'),
  'vercel-cli': () => import('./checks/vercel-cli.ts'),
}

const USAGE = `Uso:
  officina check <gate> [opzioni]   gate: ${Object.keys(CHECKS).join(', ')}
  officina gen [generatore]         section, page, component, collection, più quelli del progetto
  officina gen icons                le icone del manifest da public/favicon.svg
  officina doctor                   cosa manca al progetto perché i generatori funzionino

Opzioni dei gate sui sorgenti: --diff, --base <ref>, --head <ref>, --strict, --format text|github
bundle legge dist/client; smoke [url] e analytics [GTM-…] vanno in rete; lighthouse [--local]
I valori del progetto (URL, budget, header, controlli propri) stanno in officina.config.ts
`

// Ogni gruppo dice quale modulo carica e quali argomenti gli passa.
const GROUPS: Record<string, (args: string[]) => { load: Loader | undefined; args: string[] }> = {
  check: ([name = '', ...rest]) => ({ load: CHECKS[name], args: rest }),
  gen: (args) =>
    args[0] === 'icons'
      ? { load: () => import('./gen/icons.ts'), args: args.slice(1) }
      : { load: () => import('./gen/run.ts'), args },
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
