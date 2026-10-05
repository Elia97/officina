import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { main as checkLinks } from './links.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-links-'))
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
    return { exitCode: await checkLinks(), said: lines.join('\n') }
  } finally {
    vi.restoreAllMocks()
    process.chdir(previous)
  }
}

const page = (...hrefs: string[]) => hrefs.map((href) => `<a href="${href}">link</a>`).join('\n')

const SITE = {
  'officina.config.mjs': "export default { siteUrl: 'https://prova.test' }\n",
  'dist/client/chi-siamo/index.html': page('/'),
  'dist/client/menu.pdf': '%PDF-1.7\n',
}

const ON_DEMAND = {
  routes: [
    {
      scripts: [],
      styles: [],
      routeData: { prerender: false, route: '/blog/[slug]', pattern: '^\\/blog\\/([^/]+?)$' },
    },
  ],
}

describe('check links', () => {
  it('passa quando ogni link interno porta a una pagina o a un file della build, e conta ciò che resta fuori', async () => {
    const outside = ['https://altro.test', 'https://altro.test/due', 'tel:+39', '#su', '#giu', '#centro']
    const html = page('/chi-siamo', 'chi-siamo/', 'https://prova.test/menu.pdf', ...outside)
    const { exitCode, said } = await run(project({ ...SITE, 'dist/client/index.html': html }))

    expect(exitCode).toBe(0)
    expect(said).toContain('check:links — 4 link interni su 2 pagine di dist/client')
    expect(said).toContain('Restano fuori: 2 link esterni, 1 con un altro schema (mailto:, tel:, …), 3 ancore')
    expect(said).not.toContain('NOTA')
  })

  it('fallisce sui link rotti e sui segnaposto, raggruppati per destinazione con le pagine che li citano', async () => {
    const files = {
      ...SITE,
      'dist/client/index.html': `${page('/en/privacy', '#')}\n<a href>vuoto</a>`,
      'dist/client/chi-siamo/index.html': page('/en/privacy/'),
    }
    const { exitCode, said } = await run(project(files))

    expect(exitCode).toBe(1)
    expect(said).toContain('  - /en/privacy ← /, /chi-siamo')
    expect(said).toContain('  - segnaposto href="#" ← /')
    expect(said).toContain('  - segnaposto href="" ← /')
  })

  it('una dist/client senza HTML è un fallimento, non un verde', async () => {
    const { exitCode, said } = await run(
      project({ 'officina.config.mjs': 'export default {}\n', 'dist/client/menu.pdf': '%PDF-1.7\n' }),
    )

    expect(exitCode).toBe(1)
    expect(said).toContain('dist/client non contiene nessun .html')
  })

  it('con `features.links: false` non legge niente e lo dice', async () => {
    const { exitCode, said } = await run(
      project({ 'officina.config.mjs': 'export default { features: { links: false } }\n' }),
    )

    expect(exitCode).toBe(0)
    expect(said).toContain('spento da `features.links: false`')
  })
})

describe('check links e le rotte rese a richiesta', () => {
  it('accetta un link a una rotta che il manifest della build Vercel rende a richiesta, e lo conta', async () => {
    const entry = `var _manifest = deserializeManifest(${JSON.stringify(ON_DEMAND)});`
    const files = {
      ...SITE,
      'dist/client/index.html': page('/blog/ciao'),
      '.vercel/output/_functions/entry.mjs': entry,
    }
    const { exitCode, said } = await run(project(files))

    expect(exitCode).toBe(0)
    expect(said).toContain('1 link portano a una rotta resa a richiesta')
    expect(said).not.toContain('NOTA')
  })

  it('senza manifest ripiega sulle pagine con `prerender = false`, e non su quelle prerenderizzate', async () => {
    const files = {
      ...SITE,
      'dist/client/index.html': page('/live', '/news/ciao'),
      'src/pages/live.astro': 'export const prerender = false\n',
      'src/pages/news/[slug].astro': '<h1>Articolo</h1>\n',
    }
    const { exitCode, said } = await run(project(files))

    expect(exitCode).toBe(1)
    expect(said).toContain('  - /news/ciao ← /')
    expect(said).not.toContain('/live ←')
  })

  it('dice quando ripiega: un manifest che non si riconosce, o una build SSR senza Vercel', async () => {
    const files = { ...SITE, 'dist/client/index.html': page('/') }

    const unreadable = await run(project({ ...files, '.vercel/output/_functions/entry.mjs': 'export {}\n' }))
    expect(unreadable.said).toContain('NOTA  il manifest della build Vercel non si riconosce')
    const otherAdapter = await run(project({ ...files, 'dist/server/entry.mjs': 'export {}\n' }))
    expect(otherAdapter.said).toContain("NOTA  build SSR senza l'adapter Vercel")
  })
})
