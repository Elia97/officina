import { existsSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import collectionGenerator from './collection.mjs'
import componentGenerator from './component.mjs'
import pageGenerator from './page.mjs'
import sectionGenerator from './section.mjs'

// I generatori propri di un progetto stanno qui, nella sua radice, e si aggiungono a quelli del
// pacchetto: stessa firma di un plopfile, `export default function (plop)`.
export const PROJECT_GENERATORS = 'officina.generators.mjs'

export default async function (plop) {
  sectionGenerator(plop)
  pageGenerator(plop)
  componentGenerator(plop)
  collectionGenerator(plop)

  const extension = join(process.cwd(), PROJECT_GENERATORS)
  if (!existsSync(extension)) return
  const { default: projectGenerators } = await import(pathToFileURL(extension).href)
  await projectGenerators(plop)
}
