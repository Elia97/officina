import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { FIXTURE_ROOT } from '../test-fixture.ts'
import { CONTRACT, contractGaps } from './contract.ts'

const MANIFEST = 'package.json'
const COMMON = 'src/lib/schemas/common.ts'

const roots: string[] = []

function write(root: string, rel: string, content: string): void {
  const target = join(root, rel)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

// Due ancoraggi possono chiedere lo stesso file: scriverlo la seconda volta perderebbe il primo.
function append(root: string, rel: string, content: string): void {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  appendFileSync(join(root, rel), content)
}

function completeProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'contract-'))
  roots.push(root)
  const scripts: Record<string, string> = {}
  const dependencies: Record<string, string> = {}
  for (const requirement of CONTRACT) {
    if (requirement.kind === 'script') scripts[requirement.name] = 'echo'
    else if (requirement.kind === 'dependency') dependencies[requirement.name] = '^1.0.0'
    else if (requirement.kind === 'directory') write(root, `${requirement.path}/example${requirement.extension}`, '')
    else if (requirement.kind === 'anchor') append(root, requirement.path, `${requirement.text} = {}\n`)
    else write(root, requirement.path, '')
  }
  write(root, MANIFEST, JSON.stringify({ scripts, dependencies }))
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

  it('tratta un file al posto della cartella come mancante, e con lei perde gli schemi comuni', () => {
    const root = completeProject()
    rmSync(join(root, 'src/lib/schemas'), { recursive: true })
    write(root, 'src/lib/schemas', '')

    expect(contractGaps(root).map((gap) => gap.path)).toEqual(['src/lib/schemas', COMMON, COMMON])
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

  it('chiede ogni ancoraggio di un file che ne porta più di uno', () => {
    const root = completeProject()
    write(root, COMMON, 'export function imageSchema = {}\n')

    expect(contractGaps(root)).toEqual([
      {
        path: COMMON,
        message:
          "manca l'ancoraggio `export const ctaSchema`: lo schema di ogni sezione generata lo importa da ../common",
      },
    ])
  })
})

describe('quello che package.json deve dichiarare', () => {
  it('nomina la dipendenza che il componente generato importa', () => {
    const root = completeProject()
    write(root, MANIFEST, JSON.stringify({ scripts: { check: 'echo' } }))

    expect(contractGaps(root)).toEqual([
      {
        path: MANIFEST,
        message: 'manca la dipendenza `class-variance-authority`: il componente che scrive gen:component lo importa',
      },
    ])
  })

  it('accetta la dipendenza dichiarata fra le devDependencies', () => {
    const root = completeProject()
    write(
      root,
      MANIFEST,
      JSON.stringify({ scripts: { check: 'echo' }, devDependencies: { 'class-variance-authority': '^0.7.1' } }),
    )

    expect(contractGaps(root)).toEqual([])
  })

  it('nomina lo script che il post-gen lancia', () => {
    const root = completeProject()
    write(root, MANIFEST, JSON.stringify({ dependencies: { 'class-variance-authority': '^0.7.1' } }))

    expect(contractGaps(root)).toEqual([
      {
        path: MANIFEST,
        message: 'manca lo script `check`: il post-gen di ogni generatore lo lancia con `pnpm run check`',
      },
    ])
  })

  it('senza package.json chiede sia lo script sia la dipendenza', () => {
    const root = completeProject()
    rmSync(join(root, MANIFEST))

    expect(contractGaps(root).map((gap) => gap.path)).toEqual([MANIFEST, MANIFEST])
  })
})

describe('il progetto di prova', () => {
  it('porta i requisiti che il codice generato dà per scontati', () => {
    const paths = [COMMON, 'src/assets/placeholder.jpg', MANIFEST]

    expect(contractGaps(FIXTURE_ROOT).filter((gap) => paths.includes(gap.path))).toEqual([])
  })
})
