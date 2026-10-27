import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkPlaceholders } from './placeholders.ts'

const roots: string[] = []

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-placeholders-content-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  return root
}

const run = async (root: string): Promise<{ exitCode: number; output: string }> => {
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    return { exitCode: await checkPlaceholders([]), output: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const SOURCES = {
  'officina.config.mjs': "export default { placeholders: { sources: ['src/lib/site.ts'] } }\n",
  'src/lib/site.ts': "export const SITE = { url: 'https://acme.test' }\n",
}

describe('check placeholders su src/content', () => {
  it('ferma il deploy sul public_id di una sezione dimenticata, con file e riga', async () => {
    const root = project({
      ...SOURCES,
      'src/content/homepage/gallery.yml':
        "section: gallery\ntitle: Galleria\nimage:\n  public_id: '<PUBLIC_ID>'\n  alt: Il cantiere\n",
    })

    const { exitCode, output } = await run(root)

    expect(exitCode).toBe(1)
    expect(output).toContain('1 sorgenti e 1 file di src/content')
    expect(output).toContain('src/content/homepage/gallery.yml:4')
    expect(output).toContain('segnaposto del template <PUBLIC_ID>')
  })

  it('in un progetto senza src/content non trova niente di nuovo', async () => {
    const { exitCode, output } = await run(project(SOURCES))

    expect(exitCode).toBe(0)
    expect(output).toContain('1 sorgenti\n')
    expect(output).toContain('Nessun segnaposto del template.')
  })
})
