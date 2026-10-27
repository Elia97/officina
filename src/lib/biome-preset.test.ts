import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const PRESET = fileURLToPath(new URL('../../presets/biome.base.json', import.meta.url))
const BIOME = fileURLToPath(new URL('../../node_modules/.bin/biome', import.meta.url))

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-biome-'))
  roots.push(root)
  spawnSync('git', ['init', '-q'], { cwd: root })
  writeFileSync(join(root, 'biome.json'), `{ "extends": ["${PRESET}"] }\n`)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

const biomeCi = (cwd: string) => {
  const { status, stdout, stderr } = spawnSync(BIOME, ['ci', '--colors=off', '.'], { cwd, encoding: 'utf8' })
  return { status, output: `${stdout}${stderr}` }
}

const GENERATED = {
  'drizzle/meta/_journal.json': '{\n  "version": "7"\n}',
  'drizzle/0000_init.sql': 'CREATE TABLE "orders" ("id" serial PRIMARY KEY);\n',
}

describe('il preset di Biome con la versione installata', () => {
  it('si carica senza chiavi sconosciute', () => {
    const { status, output } = biomeCi(project({ 'src/index.ts': 'export const answer = 42\n' }))

    expect(output).not.toMatch(/deserialize|unknown key/i)
    expect(status).toBe(0)
  })

  it('non riformatta YAML e Markdown, che dalla 2.6 Biome formatta di default', () => {
    const { status, output } = biomeCi(
      project({ 'ci.yml': "on:\n  push:\n    tags: ['v*']\n", 'README.md': '| a | b |\n|---|---|\n| uno | due |\n' }),
    )

    expect(output).not.toContain('format')
    expect(status).toBe(0)
  })

  it.each([
    ['cn', "cn('px-2 flex')"],
    ['cva', "cva('px-2 flex')"],
  ])('chiede di ordinare le classi Tailwind dentro %s', (_, call) => {
    const source = `declare const cn: (...c: string[]) => string\ndeclare const cva: (c: string) => string\nexport const classes = ${call}\n`
    const { status, output } = biomeCi(project({ 'src/classes.ts': source }))

    expect(output).toContain('src/classes.ts:3:')
    expect(output).toContain('lint/nursery/useTailwindSortedClasses')
    expect(status).toBe(1)
  })
})

describe('il preset di Biome in un progetto con drizzle', () => {
  it("lascia fuori i file che drizzle-kit genera, anche i JSON senza l'a capo finale", () => {
    const { status, output } = biomeCi(project({ ...GENERATED, 'drizzle.config.ts': 'export default {}\n' }))

    expect(output).not.toContain('drizzle/')
    expect(status).toBe(0)
  })

  it('controlla drizzle.config.ts, che sta alla radice e non in drizzle/', () => {
    const { status, output } = biomeCi(project({ ...GENERATED, 'drizzle.config.ts': 'export default {  }' }))

    expect(status).toBe(1)
    expect(output).toContain('drizzle.config.ts')
  })
})
