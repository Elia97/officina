import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkBundle } from './bundle.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-spente-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true })
    writeFileSync(join(root, name), source)
  }
  return root
}

async function run(root: string): Promise<{ exitCode: number; said: string }> {
  const lines: string[] = []
  const previous = process.cwd()
  process.chdir(root)
  const keep = (line: string) => {
    lines.push(line)
  }
  vi.spyOn(console, 'error').mockImplementation(keep)
  vi.spyOn(console, 'log').mockImplementation(keep)
  try {
    return { exitCode: await checkBundle(), said: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

const NEWS_OFF = {
  'officina.config.mjs': "export default { routes: { disabled: ['/news/[slug]'] } }\n",
  'src/pages/index.astro': '<h1>Casa</h1>\n',
  'src/pages/news/[slug].astro': '<h1>Articolo</h1>\n',
  'dist/client/_astro/main.css': 'body { margin: 0 }\n',
  'dist/client/index.html': '<link rel="stylesheet" href="/_astro/main.css"><h1>Casa</h1>',
}

const FUNCTIONS = '.vercel/output/_functions'

const ON_DEMAND = {
  routes: [
    {
      scripts: [],
      styles: [],
      routeData: {
        type: 'page',
        origin: 'project',
        prerender: false,
        route: '/blog/[slug]',
        component: 'src/pages/blog/[slug].astro',
      },
    },
  ],
}

const SERVER_ENTRY = [
  'var _page0 = () => import("./chunks/blog.mjs");',
  'const pageMap = new Map([["src/pages/blog/[slug].astro", _page0]]);',
  `var _manifest = deserializeManifest(${JSON.stringify(ON_DEMAND)});`,
].join('\n')

describe('check bundle e una pagina dinamica spenta per scelta', () => {
  it('non la pretende quando non emette niente, e la elenca come spenta', async () => {
    const { exitCode, said } = await run(project(NEWS_OFF))

    expect(exitCode).toBe(0)
    expect(said).toContain('SPENTE  da `routes.disabled`, nessuna pagina attesa:')
    expect(said).toMatch(/^ {6}- \/news\/\[slug\] \(src\/pages\/news\/\[slug\]\.astro\)$/m)
  })

  it('fallisce quando la build emette una pagina che solo il pattern spento spiega', async () => {
    const files = { ...NEWS_OFF, 'dist/client/news/ciao/index.html': '<h1>Ciao</h1>' }
    const { exitCode, said } = await run(project(files))

    expect(exitCode).toBe(1)
    expect(said).toContain('rotta spenta /news/[slug]: è in `routes.disabled`, ma la build ha emesso /news/ciao')
  })

  it("fallisce quando la build la rende a richiesta, come senza `prerender` in `output: 'server'`", async () => {
    const { exitCode, said } = await run(
      project({
        'officina.config.mjs': "export default { routes: { disabled: ['/blog/[slug]'] } }\n",
        'src/pages/blog/[slug].astro': '<h1>Articolo</h1>\n',
        'dist/client/_astro/main.css': 'body { margin: 0 }\n',
        [`${FUNCTIONS}/entry.mjs`]: SERVER_ENTRY,
        [`${FUNCTIONS}/chunks/blog.mjs`]: 'render()\n',
      }),
    )

    expect(exitCode).toBe(1)
    expect(said).toContain('rotta spenta /blog/[slug]: è in `routes.disabled`, ma la build la rende a richiesta')
  })
})
