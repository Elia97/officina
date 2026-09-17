import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Quello che un progetto deve avere perché i generatori scrivano codice che compila: i moduli che
// il codice generato importa, i punti in cui i generatori iniettano, e ciò che package.json deve
// dichiarare perché quel codice si installi e superi il post-gen.
type Requirement =
  | { kind: 'file'; path: string; reason: string }
  | { kind: 'directory'; path: string; extension: string; reason: string }
  | { kind: 'anchor'; path: string; text: string; reason: string }
  | { kind: 'dependency'; name: string; reason: string }
  | { kind: 'script'; name: string; reason: string }

const MANIFEST = 'package.json'

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
    path: 'src/lib/schemas/common.ts',
    text: 'export const ctaSchema',
    reason: 'lo schema di ogni sezione generata lo importa da ../common',
  },
  {
    kind: 'anchor',
    path: 'src/lib/schemas/common.ts',
    text: 'export function imageSchema',
    reason: "lo schema di una sezione con immagine lo importa da ../common, e lo chiama con l'helper di Astro",
  },
  {
    kind: 'file',
    path: 'src/assets/placeholder.jpg',
    reason: 'il contenuto di una sezione con immagine ci punta appena generato',
  },
  {
    kind: 'anchor',
    path: 'src/content.config.ts',
    text: 'export const collections',
    reason: 'gen:collection e gen:section registrano lì la collection',
  },
  {
    kind: 'dependency',
    name: 'class-variance-authority',
    reason: 'il componente che scrive gen:component lo importa',
  },
  { kind: 'script', name: 'check', reason: 'il post-gen di ogni generatore lo lancia con `pnpm run check`' },
]

export interface ContractGap {
  path: string
  message: string
}

interface Manifest {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

function hasFileWith(directory: string, extension: string): boolean {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return false
  return readdirSync(directory, { recursive: true }).some((entry) => String(entry).endsWith(extension))
}

function manifestGap(manifest: Manifest, requirement: Requirement): ContractGap | undefined {
  if (requirement.kind === 'script') {
    return manifest.scripts?.[requirement.name] === undefined
      ? { path: MANIFEST, message: `manca lo script \`${requirement.name}\`: ${requirement.reason}` }
      : undefined
  }
  if (requirement.kind !== 'dependency') return undefined
  const declared = { ...manifest.dependencies, ...manifest.devDependencies }
  return declared[requirement.name] === undefined
    ? { path: MANIFEST, message: `manca la dipendenza \`${requirement.name}\`: ${requirement.reason}` }
    : undefined
}

function pathGap(root: string, requirement: Requirement): ContractGap | undefined {
  if (requirement.kind === 'dependency' || requirement.kind === 'script') return undefined
  const gap = (message: string): ContractGap => ({ path: requirement.path, message })
  const target = join(root, requirement.path)
  if (requirement.kind === 'directory') {
    return hasFileWith(target, requirement.extension) ? undefined : gap(`manca, o è vuota: ${requirement.reason}`)
  }
  if (!existsSync(target)) return gap(`manca: ${requirement.reason}`)
  if (requirement.kind === 'anchor' && !readFileSync(target, 'utf8').includes(requirement.text)) {
    return gap(`manca l'ancoraggio \`${requirement.text}\`: ${requirement.reason}`)
  }
  return undefined
}

function readManifest(root: string): Manifest {
  const target = join(root, MANIFEST)
  return existsSync(target) ? (JSON.parse(readFileSync(target, 'utf8')) as Manifest) : {}
}

export function contractGaps(root: string): ContractGap[] {
  const manifest = readManifest(root)
  return CONTRACT.flatMap((requirement) => {
    const gap = pathGap(root, requirement) ?? manifestGap(manifest, requirement)
    return gap === undefined ? [] : [gap]
  })
}
