import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { HookPointError } from '../gen/hook-points.mjs'
import { assertSectionAnchors } from '../gen/inject-section.mjs'
import { assertDictionaries } from '../gen/inject-strings.mjs'
import { sectionedCollections } from '../gen/section-targets.mjs'
import type { ContractGap } from './contract.ts'

// Gli ancoraggi che i generatori trovano al lancio, guardati senza generare niente: sono gli
// stessi controlli del pre-volo, tolto ciò che dipende dal nome della cosa nuova.
const CONFIG = 'src/content.config.ts'
const DICTIONARIES = 'src/i18n/strings'

interface Collection {
  camel: string
  kebab: string
  pascal: string
}

function gapsFrom(fallback: string, check: () => void): ContractGap[] {
  try {
    check()
    return []
  } catch (error) {
    if (error instanceof HookPointError) return [{ path: String(error.path), message: String(error.problem) }]
    return [{ path: fallback, message: `non si lascia leggere: ${String(error)}` }]
  }
}

function sectionGaps(root: string): ContractGap[] {
  if (!existsSync(join(root, CONFIG))) return []
  const collections: Collection[] = sectionedCollections(root)
  return collections.flatMap((collection) => gapsFrom(CONFIG, () => assertSectionAnchors({ root, collection })))
}

function dictionaryGaps(root: string): ContractGap[] {
  if (!existsSync(join(root, DICTIONARIES))) return []
  return gapsFrom(DICTIONARIES, () => assertDictionaries({ root }))
}

export function anchorGaps(root: string): ContractGap[] {
  return [...sectionGaps(root), ...dictionaryGaps(root)]
}
