import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'

import definePlopfile, { PROJECT_GENERATORS } from './plopfile.mjs'
import type { FakePlop, GeneratorConfig } from './test-helpers/fake-plop.ts'

const original = process.cwd()
const roots: string[] = []

function projectRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'plopfile-'))
  roots.push(root)
  process.chdir(root)
  return root
}

function emptyPlop(): FakePlop {
  const registered = new Map<string, GeneratorConfig>()
  return {
    setGenerator: (name, config) => {
      registered.set(name, config)
    },
    getHelper: () => (value) => value,
    registered,
  }
}

afterEach(() => {
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('plopfile del pacchetto', () => {
  it('registra i quattro generatori', async () => {
    projectRoot()
    const plop = emptyPlop()

    await definePlopfile(plop)

    expect([...plop.registered.keys()].sort()).toEqual(['collection', 'component', 'page', 'section'])
  })

  it('aggiunge i generatori propri del progetto, quando ci sono', async () => {
    const root = projectRoot()
    writeFileSync(
      join(root, PROJECT_GENERATORS),
      "export default function (plop) {\n  plop.setGenerator('listing', { description: 'x', prompts: [], actions: [] })\n}\n",
    )
    const plop = emptyPlop()

    await definePlopfile(plop)

    expect([...plop.registered.keys()]).toContain('listing')
  })
})
