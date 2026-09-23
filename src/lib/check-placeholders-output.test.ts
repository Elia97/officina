import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { outputFindings } from './check-placeholders.ts'

const roots: string[] = []

function build(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-output-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('outputFindings', () => {
  it('nomina ogni file della build in cui è entrato il segnaposto di una Sensitive', () => {
    const root = build({
      'static/_astro/page.js': 'const from="[SENSITIVE]";',
      'functions/_render.func/chunks/actions.mjs': 'export const sender = "[SENSITIVE]"',
      'static/index.html': '<p>Acme</p>',
    })

    expect(outputFindings(root)).toEqual([
      {
        path: join(root, 'functions/_render.func/chunks/actions.mjs'),
        severity: 'error',
        message:
          "contiene [SENSITIVE], il segnaposto che vercel pull scrive per una variabile Sensitive: la build l'ha incorporato al posto del valore",
      },
      expect.objectContaining({ path: join(root, 'static/_astro/page.js') }),
    ])
  })

  it('non trova niente in una build pulita', () => {
    expect(outputFindings(build({ 'static/index.html': '<p>Acme</p>', 'config.json': '{}' }))).toEqual([])
  })

  it('non segue i link simbolici, che nelle funzioni puntano dentro node_modules', () => {
    const outside = build({ 'lib.js': 'const x="[SENSITIVE]"' })
    const root = build({ 'static/index.html': '<p>Acme</p>' })
    symlinkSync(outside, join(root, 'node_modules'))

    expect(outputFindings(root)).toEqual([])
  })
})
