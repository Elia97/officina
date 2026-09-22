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
  const root = mkdtempSync(join(tmpdir(), 'officina-ssr-'))
  roots.push(root)
  for (const [name, source] of Object.entries(files)) {
    const path = join(root, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, source)
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

const FUNCTIONS = '.vercel/output/_functions'

const MANIFEST = {
  routes: [
    {
      scripts: [],
      routeData: { type: 'page', origin: 'project', prerender: false, route: '/', component: 'src/pages/index.astro' },
    },
  ],
  entryModules: { '@/components/search': '_astro/search.A1.js' },
}

const SERVER_ENTRY = [
  'var _page0 = () => import("./chunks/home.mjs");',
  'const pageMap = new Map([["src/pages/index.astro", _page0]]);',
  `var _manifest = deserializeManifest(${JSON.stringify(MANIFEST)});`,
].join('\n')

const BASE = {
  'officina.config.mjs': 'export default {}\n',
  'src/pages/index.astro': '<h1>Casa</h1>\n',
  'dist/client/_astro/search.A1.js': 'export const search = () => "cerca"\n',
  'dist/client/_astro/style.css': 'h1 { color: red }\n',
}

const VERCEL = {
  ...BASE,
  [`${FUNCTIONS}/entry.mjs`]: SERVER_ENTRY,
  [`${FUNCTIONS}/chunks/home.mjs`]: 'render("@/components/search")\n',
  [`${FUNCTIONS}/chunks/home.mjs.map`]: '{}\n',
}

describe('una build SSR con l’adapter Vercel', () => {
  it('misura le rotte dal manifest di Astro, senza cercare HTML', async () => {
    const { exitCode, said } = await run(project(VERCEL))

    expect(exitCode).toBe(0)
    expect(said).toMatch(/^\/ +0\.\d KB/m)
    expect(said).not.toContain('.html')
    expect(said).toContain('rispettato su ogni rotta attesa')
  })

  it('applica gli stessi budget delle rotte statiche', async () => {
    const tight = 'export default { bundle: { budgets: [{ label: "stretto", matches: () => true, maxGzip: 10 }] } }\n'
    const { exitCode, said } = await run(project({ ...VERCEL, 'officina.config.mjs': tight }))

    expect(exitCode).toBe(1)
    expect(said).toContain('/: 0.')
  })

  it('fallisce su una pagina senza chunk server, invece di misurarne soltanto una parte', async () => {
    const unmapped = SERVER_ENTRY.replace('var _page0 = () => import("./chunks/home.mjs");', '')
    const { exitCode, said } = await run(project({ ...VERCEL, [`${FUNCTIONS}/entry.mjs`]: unmapped }))

    expect(exitCode).toBe(1)
    expect(said).toContain('/: nessun chunk server')
  })
  it("fallisce su un'isola che il manifest non collega al client", async () => {
    const ghost = 'render({ "client:component-path": "@/components/ghost" })\n'
    const { exitCode, said } = await run(project({ ...VERCEL, [`${FUNCTIONS}/chunks/home.mjs`]: ghost }))

    expect(exitCode).toBe(1)
    expect(said).toContain("/: l'isola @/components/ghost")
  })
})

describe('un manifest che non si riconosce', () => {
  it('con delle pagine statiche lo dice, e misura quelle', async () => {
    const { exitCode, said } = await run(
      project({
        ...BASE,
        'dist/client/index.html': '<script type="module" src="/_astro/search.A1.js"></script>\n',
        [`${FUNCTIONS}/chunks/other.mjs`]: 'export {}\n',
      }),
    )

    expect(exitCode).toBe(0)
    expect(said).toContain('NOTA')
    expect(said).toContain('non è in una forma riconosciuta')
  })

  it('senza pagine statiche fallisce nominandolo, non come una build vuota', async () => {
    const { exitCode, said } = await run(project({ ...BASE, [`${FUNCTIONS}/entry.mjs`]: 'export {}\n' }))

    expect(exitCode).toBe(1)
    expect(said).toContain('non è in una forma riconosciuta')
    expect(said).not.toContain('nessun .html')
  })
})

describe('una build senza l’adapter Vercel', () => {
  it('con il server e senza HTML è SSR: le rotte restano fuori, dichiarate, e il CSS si misura', async () => {
    const { exitCode, said } = await run(project({ ...BASE, 'dist/server/entry.mjs': 'export {}\n' }))

    expect(exitCode).toBe(0)
    expect(said).toContain('senza l')
    expect(said).toContain('le rotte non sono state misurate')
  })

  it('senza server e senza HTML resta una build vuota, che non afferma niente', async () => {
    const { exitCode, said } = await run(project(BASE))

    expect(exitCode).toBe(1)
    expect(said).toContain('nessun .html')
  })

  it('statica si misura come sempre', async () => {
    const html = '<script type="module" src="/_astro/search.A1.js"></script>\n'
    const { exitCode, said } = await run(project({ ...BASE, 'dist/client/index.html': html }))

    expect(exitCode).toBe(0)
    expect(said).not.toContain('NOTA')
  })
})
