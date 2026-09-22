import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { type ServerFile, ssrRoutes } from './vercel-build.ts'

const FUNCTIONS = '.vercel/output/_functions'
const SERVER_OUTPUT = 'dist/server'

export type PageEntries = { route: string; entries: string[] }

export type SsrReading = {
  pages: PageEntries[]
  failures: string[]
  notes: string[]
  comparesExpectedRoutes: boolean
  measured: boolean
}

function readServerFiles(): ServerFile[] {
  const read = (path: string): ServerFile => ({ path, source: readFileSync(join(FUNCTIONS, path), 'utf8') })
  const chunks = existsSync(join(FUNCTIONS, 'chunks')) ? readdirSync(join(FUNCTIONS, 'chunks')) : []
  const entry = existsSync(join(FUNCTIONS, 'entry.mjs')) ? ['entry.mjs'] : []
  return [...entry, ...chunks.filter((name) => name.endsWith('.mjs')).map((name) => `chunks/${name}`)].map(read)
}

/** Le rotte renderizzate a richiesta non emettono HTML: le dà il manifest che Astro scrive nella build Vercel. */
export function readSsr(hasHtml: boolean): SsrReading {
  const none: SsrReading = { pages: [], failures: [], notes: [], comparesExpectedRoutes: true, measured: false }
  if (!existsSync(FUNCTIONS)) {
    if (hasHtml || !existsSync(SERVER_OUTPUT)) return none
    const note = `build SSR senza l'adapter Vercel: le rotte non si misurano, resta il budget del CSS`
    return { ...none, notes: [note], comparesExpectedRoutes: false }
  }
  const routes = ssrRoutes(readServerFiles())
  if (routes === null) {
    const problem = `${FUNCTIONS}: il manifest di Astro non è in una forma riconosciuta`
    return hasHtml
      ? { ...none, notes: [`${problem}, le rotte renderizzate a richiesta restano fuori dal budget`] }
      : { ...none, failures: [`${problem}, quindi non c'è nessuna rotta da misurare`], comparesExpectedRoutes: false }
  }
  return {
    ...none,
    pages: routes.map(({ route, entries }) => ({ route, entries })),
    failures: routes.flatMap(({ route, unmapped, unknownIslands }) => [
      ...(unmapped ? [`${route}: nessun chunk server in ${FUNCTIONS}, la misura non coprirebbe le isole`] : []),
      ...unknownIslands.map(
        (island) => `${route}: l'isola ${island} non ha un chunk in dist/client/_astro fra quelli del manifest`,
      ),
    ]),
    measured: true,
  }
}
