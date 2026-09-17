import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Quello che un progetto deve avere perché i generatori scrivano codice che compila: i moduli che
// il codice generato importa, e i punti in cui i generatori iniettano.
type Requirement =
  | { kind: 'file'; path: string; reason: string }
  | { kind: 'directory'; path: string; extension: string; reason: string }
  | { kind: 'anchor'; path: string; text: string; reason: string }

export const CONTRACT: Requirement[] = [
  { kind: 'file', path: 'src/components/ui/section.astro', reason: 'le sezioni generate la importano' },
  { kind: 'file', path: 'src/components/ui/container.astro', reason: 'le sezioni e le pagine generate lo importano' },
  { kind: 'file', path: 'src/components/ui/heading.astro', reason: 'le sezioni e le pagine generate lo importano' },
  { kind: 'file', path: 'src/components/ui/button.astro', reason: 'le sezioni generate lo importano' },
  { kind: 'file', path: 'src/layouts/main.astro', reason: 'le pagine generate lo usano come layout' },
  { kind: 'file', path: 'src/i18n/translate.ts', reason: 'le pagine generate traducono titolo e descrizione' },
  { kind: 'file', path: 'src/i18n/href.ts', reason: 'le sezioni generate localizzano i link delle CTA' },
  { kind: 'file', path: 'src/i18n/ui.ts', reason: 'gen:page registra lì le chiavi della pagina' },
  {
    kind: 'directory',
    path: 'src/i18n/strings',
    extension: '.ts',
    reason: 'gen:page scrive le stringhe in ogni dizionario',
  },
  { kind: 'file', path: 'src/lib/utils.ts', reason: 'i componenti generati usano cn()' },
  {
    kind: 'file',
    path: 'src/lib/content/localized-sections.ts',
    reason: 'lo strato dati di una pagina a sezioni lo usa',
  },
  {
    kind: 'directory',
    path: 'src/lib/schemas',
    extension: '.ts',
    reason: 'gen:collection e gen:section scrivono lì gli schemi',
  },
  {
    kind: 'anchor',
    path: 'src/content.config.ts',
    text: 'export const collections',
    reason: 'gen:collection e gen:section registrano lì la collection',
  },
]

export interface ContractGap {
  path: string
  message: string
}

function hasFileWith(directory: string, extension: string): boolean {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return false
  return readdirSync(directory, { recursive: true }).some((entry) => String(entry).endsWith(extension))
}

function gapFor(root: string, requirement: Requirement): string | undefined {
  const target = join(root, requirement.path)
  if (requirement.kind === 'directory') {
    return hasFileWith(target, requirement.extension) ? undefined : `manca, o è vuota: ${requirement.reason}`
  }
  if (!existsSync(target)) return `manca: ${requirement.reason}`
  if (requirement.kind === 'anchor' && !readFileSync(target, 'utf8').includes(requirement.text)) {
    return `manca l'ancoraggio \`${requirement.text}\`: ${requirement.reason}`
  }
  return undefined
}

export function contractGaps(root: string): ContractGap[] {
  return CONTRACT.flatMap((requirement) => {
    const message = gapFor(root, requirement)
    return message === undefined ? [] : [{ path: requirement.path, message }]
  })
}
