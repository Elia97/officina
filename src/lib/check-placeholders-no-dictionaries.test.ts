import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { placeholderSources } from './check-placeholders.ts'

const root = mkdtempSync(join(tmpdir(), 'officina-senza-dizionari-'))
let previous = ''

beforeAll(() => {
  previous = process.cwd()
  process.chdir(root)
})

afterAll(() => {
  process.chdir(previous)
  rmSync(root, { recursive: true, force: true })
})

describe('un progetto senza src/i18n/strings', () => {
  it('resta ai due sorgenti del template invece di cadere sulla cartella assente', () => {
    expect(placeholderSources()).toEqual(['src/lib/site.ts', 'src/lib/company.ts'])
  })
})
