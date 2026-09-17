// I punti di aggancio vengono dal progetto di prova, che li copia da `vetrina`. Che il progetto
// vero li abbia ancora lo verifica `officina doctor`, non questi test.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { FIXTURE_ROOT } from '../../test-fixture.ts'

const HOOK_POINTS = [
  'src/lib/schemas/homepage/index.ts',
  'src/lib/homepage.ts',
  'src/pages/index.astro',
  'src/content.config.ts',
  'src/i18n/strings/it.ts',
] as const

const roots: string[] = []

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

export function makeRoot(overrides: Record<string, string | null> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'gen-fixture-'))
  roots.push(root)
  for (const rel of HOOK_POINTS) {
    write(root, rel, readFileSync(join(FIXTURE_ROOT, rel), 'utf8'))
  }
  for (const [rel, content] of Object.entries(overrides)) {
    if (content === null) rmSync(join(root, rel), { force: true })
    else write(root, rel, content)
  }
  return root
}

export function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

/** Da chiamare in afterEach: altrimenti gli alberi temporanei sopravvivono al processo. */
export function cleanupRoots(): void {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
}
