import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkLighthouse } from './lighthouse.ts'

vi.mock('node:child_process', () => ({ spawnSync: vi.fn(() => ({ status: 0 })) }))

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const CONFIG = `export default {
  routes: { representatives: { '/news/[slug]': '/news/ciao' }, disabled: ['/news/[slug]'] },
}
`

const FILES = {
  'officina.config.mjs': CONFIG,
  '.lighthouserc.json': '{ "ci": { "collect": {} } }\n',
  'src/pages/index.astro': '<h1>Casa</h1>\n',
  'src/pages/news/[slug].astro': '<h1>Articolo</h1>\n',
}

describe('check lighthouse e una pagina dinamica spenta per scelta', () => {
  it("non misura il suo rappresentante, anche se c'è ancora, e lo dice", async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-lighthouse-spente-'))
    roots.push(root)
    for (const [name, source] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), source)
    }
    process.chdir(root)

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))

    expect(await checkLighthouse(['https://prova.test'])).toBe(0)
    expect(lines).toContain('  https://prova.test/')
    expect(lines.join('\n')).not.toContain('/news/ciao')
    expect(lines).toContain('  /news/[slug] — spenta da `routes.disabled`, non misurata')
  })
})
