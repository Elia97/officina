import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as doctor } from './doctor.ts'

const original = process.cwd()
const roots: string[] = []

afterEach(() => {
  vi.restoreAllMocks()
  process.chdir(original)
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const FILES = {
  'officina.config.mjs': "export default { routes: { disabled: ['/news/[slug]', '/contatti', '/news/[slgu]'] } }\n",
  'src/pages/contatti.astro': '<h1>Contatti</h1>\n',
  'src/pages/news/[slug].astro': '<h1>Articolo</h1>\n',
  'src/pages/blog/[slug].astro': '<h1>Articolo</h1>\n',
}

describe('doctor e una pagina dinamica spenta per scelta', () => {
  it('non chiede il rappresentante del pattern spento, e boccia le voci che non spengono niente', async () => {
    const root = mkdtempSync(join(tmpdir(), 'officina-doctor-spente-'))
    roots.push(root)
    for (const [name, source] of Object.entries(FILES)) {
      mkdirSync(dirname(join(root, name)), { recursive: true })
      writeFileSync(join(root, name), source)
    }
    // trackedAndUntracked (src/lib/git.ts) muore con «fatal: not a git repository» fuori da un repository.
    spawnSync('git', ['init', '--quiet'], { cwd: root })
    process.chdir(root)

    const lines: string[] = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
    await doctor()
    const said = lines.join('\n')

    expect(said).toContain('`routes.representatives` non ha un percorso per `/blog/[slug]`')
    expect(said).not.toContain('non ha un percorso per `/news/[slug]`')
    expect(said).toContain('    · spente da `routes.disabled`: /news/[slug]')
    expect(said).toContain('✗ officina.config.ts: `routes.disabled` nomina `/contatti`')
    expect(said).toContain('✗ officina.config.ts: `routes.disabled` nomina `/news/[slgu]`')
    expect(said).not.toContain('nomina `/news/[slug]`')
  })
})
