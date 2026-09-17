import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { CONTRACT, contractGaps } from './contract.ts'

const roots: string[] = []

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function completeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'contract-'))
  roots.push(root)
  for (const requirement of CONTRACT) {
    if (requirement.kind === 'directory') write(root, `${requirement.path}/example${requirement.extension}`, '')
    else write(root, requirement.path, requirement.kind === 'anchor' ? `${requirement.text} = {}\n` : '')
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('contractGaps', () => {
  it('non trova niente in un progetto che ha tutti i punti di aggancio', () => {
    expect(contractGaps(completeProject())).toEqual([])
  })

  it('nomina il file che manca e a cosa serve', () => {
    const root = completeProject()
    rmSync(join(root, 'src/components/ui/heading.astro'))

    expect(contractGaps(root)).toEqual([
      { path: 'src/components/ui/heading.astro', message: 'manca: le sezioni e le pagine generate lo importano' },
    ])
  })

  it('tratta una cartella senza file del tipo atteso come mancante', () => {
    const root = completeProject()
    rmSync(join(root, 'src/i18n/strings/example.ts'))

    expect(contractGaps(root).map((gap) => gap.path)).toEqual(['src/i18n/strings'])
  })

  it('tratta un file al posto della cartella come mancante', () => {
    const root = completeProject()
    rmSync(join(root, 'src/lib/schemas'), { recursive: true })
    write(root, 'src/lib/schemas', '')

    expect(contractGaps(root).map((gap) => gap.path)).toEqual(['src/lib/schemas'])
  })

  it("vede il file che c'è ma ha perso l'ancoraggio", () => {
    const root = completeProject()
    write(root, 'src/content.config.ts', 'export const other = {}\n')

    expect(contractGaps(root)).toEqual([
      {
        path: 'src/content.config.ts',
        message:
          "manca l'ancoraggio `export const collections`: gen:collection e gen:section registrano lì la collection",
      },
    ])
  })
})
