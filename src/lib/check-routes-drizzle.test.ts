import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { findingsFor } from './check-routes.ts'

let previous = ''
let root = ''

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'officina-routes-'))
  mkdirSync(join(root, 'drizzle/meta'), { recursive: true })
  writeFileSync(join(root, 'drizzle.config.ts'), 'export default {}\n')
  writeFileSync(join(root, 'drizzle/meta/_journal.json'), '{}\n')
  previous = process.cwd()
  process.chdir(root)
})

afterAll(() => {
  process.chdir(previous)
  rmSync(root, { recursive: true, force: true })
})

describe('findingsFor in un progetto con drizzle', () => {
  it("segue drizzle.config.ts e i percorsi sotto drizzle/: validi se il file c'è, rotti se manca", () => {
    const doc = '`drizzle.config.ts` scrive `drizzle/meta/_journal.json` e `drizzle/0001_ordini.sql`\n'

    expect(findingsFor('docs/ARCHITECTURE.md', doc)).toEqual([
      { line: 1, message: 'percorso che non esiste: drizzle/0001_ordini.sql' },
    ])
  })
})
