import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as genIcons } from '../gen/icons.ts'
import { main as checkAnalytics } from './analytics.ts'
import { main as checkBundle } from './bundle.ts'
import { main as checkLighthouse } from './lighthouse.ts'
import { main as checkSmoke } from './smoke.ts'

const roots: string[] = []

function project(files: Record<string, string> = {}, dirs: readonly string[] = []): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-ingressi-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
  }
  for (const dir of dirs) mkdirSync(join(root, dir), { recursive: true })
  return root
}

const config = (body: string) => ({ 'officina.config.mjs': `export default ${body}\n` })

const run = async (root: string, command: () => Promise<number>): Promise<{ exitCode: number; said: string }> => {
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  vi.spyOn(console, 'error').mockImplementation((line: string) => {
    lines.push(line)
  })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    return { exitCode: await command(), said: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

type Caso = {
  nome: string
  files?: Record<string, string>
  dirs?: string[]
  comando: () => Promise<number>
  nomina: string[]
}

const CASI: Caso[] = [
  {
    nome: 'gen icons senza il favicon da cui disegna',
    files: config("{ icons: { background: '#ffffff' } }"),
    comando: () => genIcons(),
    nomina: ['public/favicon.svg'],
  },
  {
    nome: 'check analytics senza il modulo di link-tracking, e senza andare in rete',
    files: config('{}'),
    comando: () => checkAnalytics(['GTM-PROVA']),
    nomina: ['src/lib/analytics/link-tracking.ts'],
  },
  {
    nome: 'check lighthouse senza la sua configurazione',
    files: config('{}'),
    comando: () => checkLighthouse([]),
    nomina: ['.lighthouserc.json'],
  },
  {
    nome: 'check lighthouse con la configurazione ma senza le pagine',
    files: { ...config('{}'), '.lighthouserc.json': '{}\n' },
    comando: () => checkLighthouse([]),
    nomina: ['src/pages'],
  },
  {
    nome: 'check bundle senza la build da misurare',
    files: config('{}'),
    comando: () => checkBundle(),
    nomina: ['dist/client/_astro', 'pnpm build'],
  },
  {
    nome: 'check bundle con la build ma senza le pagine',
    files: config('{}'),
    dirs: ['dist/client/_astro'],
    comando: () => checkBundle(),
    nomina: ['src/pages'],
  },
  {
    nome: 'check smoke senza le pagine da visitare',
    files: config("{ siteUrl: 'https://acme.test' }"),
    comando: () => checkSmoke([]),
    nomina: ['src/pages'],
  },
]

describe('un ingresso che manca si legge, invece di uscire con uno stack trace', () => {
  it.each(CASI)('$nome', async ({ files, dirs, comando, nomina }) => {
    const { exitCode, said } = await run(project(files, dirs), comando)

    expect(exitCode).toBe(1)
    for (const atteso of nomina) expect(said).toContain(atteso)
    expect(said).not.toContain('ENOENT')
  })
})
