import { describe, expect, it } from 'vitest'

import { type ServerFile, ssrRoutes } from './vercel-build.ts'

type RouteData = { type?: string; origin?: string; prerender?: boolean; route?: unknown; component?: unknown }

const page = (route: string, component: string, extra: RouteData = {}, scripts: object[] = []) => ({
  scripts,
  routeData: { type: 'page', origin: 'project', prerender: false, route, component, ...extra },
})

const PAGE_MAP = [
  'var _page0 = () => import("./chunks/home.mjs");',
  'var _page1 = () => import("./chunks/about.mjs");',
  'const pageMap = new Map([',
  '\t["src/pages/index.astro", _page0],',
  '\t["src/pages/about.astro", _page1],',
  '\t["src/pages/orphan.astro", _page9]',
  ']);',
].join('\n')

const entry = (manifest: object): ServerFile => ({
  path: 'entry.mjs',
  source: `${PAGE_MAP}\nvar _manifest = deserializeManifest(${JSON.stringify(manifest)});\n`,
})

const chunk = (name: string, source: string): ServerFile => ({ path: `chunks/${name}`, source })

const MODULES = {
  '@/components/search': '_astro/search.A1.js',
  'src/components/header.astro?astro&type=script&index=0&lang.ts': '_astro/header.B2.js',
  'src/components/menu.astro?astro&type=script&index=0&lang.ts': '_astro/menu.C3.js',
  '@astrojs/react/client.js': '_astro/client.D4.js',
  'src/content/posts/uno.mdx': 'chunks/uno.mjs',
}

const INLINED = [['src/components/menu.astro?astro&type=script&index=0&lang.ts', 'console.log("}{")']]

const SITE = [
  chunk('home.mjs', 'import { a } from "./layout.mjs";\nrender("@/components/search");\n'),
  chunk('about.mjs', 'import "./layout.mjs";\n'),
  chunk(
    'layout.mjs',
    [
      'import "./about.mjs";',
      'import "./missing.mjs";',
      'import "../entry.mjs";',
      'renderScript("src/components/header.astro?astro&type=script&index=0&lang.ts");',
      'renderScript("src/components/menu.astro?astro&type=script&index=0&lang.ts");',
    ].join('\n'),
  ),
]

const routesOf = (routes: object[]) =>
  ssrRoutes([entry({ routes, entryModules: MODULES, inlinedScripts: INLINED }), ...SITE])

describe('il manifest di Astro', () => {
  it('manca: la build non è in una forma riconosciuta', () => {
    expect(ssrRoutes([chunk('a.mjs', 'function deserializeManifest(serialized) { return serialized }')])).toBeNull()
  })

  it('non è JSON: la build non è in una forma riconosciuta', () => {
    expect(ssrRoutes([chunk('a.mjs', 'deserializeManifest({ routes: [] })')])).toBeNull()
  })

  it('non si chiude: la build non è in una forma riconosciuta', () => {
    expect(ssrRoutes([chunk('a.mjs', 'deserializeManifest({"routes": [')])).toBeNull()
  })

  it('senza rotte né moduli non ha niente da misurare', () => {
    expect(ssrRoutes([entry({})])).toEqual([])
  })

  it('si legge anche con graffe e virgolette dentro le stringhe', () => {
    expect(routesOf([page('/', 'src/pages/index.astro')])?.[0]?.route).toBe('/')
  })
})

describe('le rotte misurate', () => {
  it('sono le pagine del progetto renderizzate a richiesta', () => {
    const routes = routesOf([
      page('/', 'src/pages/index.astro'),
      page('/prerenderizzata', 'src/pages/about.astro', { prerender: true }),
      page('/_server-islands/[name]', '_server-islands.astro', { origin: 'internal' }),
      page('/api', 'src/pages/api.ts', { type: 'endpoint' }),
      page('/senza-nome', 'src/pages/about.astro', { route: 7 }),
      {},
    ])

    expect(routes?.map(({ route }) => route)).toEqual(['/'])
  })

  it('portano le isole e gli script che i loro chunk server nominano, con il runtime del framework', () => {
    expect(routesOf([page('/', 'src/pages/index.astro')])).toEqual([
      { route: '/', entries: ['client.D4.js', 'header.B2.js', 'search.A1.js'], unmapped: false, unknownIslands: [] },
    ])
  })

  it('senza isole non caricano il runtime del framework, e gli script incorporati restano fuori', () => {
    expect(routesOf([page('/chi-siamo', 'src/pages/about.astro')])?.[0]?.entries).toEqual(['header.B2.js'])
  })

  it('aggiungono gli script esterni della rotta, e soltanto quelli', () => {
    const scripts = [
      { type: 'external', value: '_astro/page.E5.js' },
      { type: 'external' },
      { type: 'external', value: 'chunks/server.mjs' },
      { type: 'inline', value: '_astro/inline.F6.js' },
    ]

    expect(routesOf([page('/chi-siamo', 'src/pages/about.astro', {}, scripts)])?.[0]?.entries).toEqual([
      'header.B2.js',
      'page.E5.js',
    ])
  })

  it('senza un chunk server da seguire restano segnate, invece di misurare meno del vero', () => {
    expect(routesOf([page('/orfana', 'src/pages/orphan.astro')])).toEqual([
      { route: '/orfana', entries: [], unmapped: true, unknownIslands: [] },
    ])
  })

  it("non confondono un'isola con un'altra il cui nome la contiene", () => {
    const modules = { '@/components/form': '_astro/form.A.js', '@/components/form-wizard': '_astro/wizard.B.js' }
    const files = [
      entry({ routes: [page('/', 'src/pages/index.astro')], entryModules: modules }),
      chunk('home.mjs', 'render({ "client:component-path": "@/components/form-wizard" })\n'),
    ]

    expect(ssrRoutes(files)?.[0]?.entries).toEqual(['wizard.B.js'])
  })

  it("segnano l'isola che il manifest non collega a un chunk del client, invece di misurare meno", () => {
    const files = [
      entry({ routes: [page('/', 'src/pages/index.astro')], entryModules: MODULES }),
      chunk(
        'home.mjs',
        '"client:component-path": "@/components/search"\n"client:component-path": "@/components/ghost"\n',
      ),
    ]

    expect(ssrRoutes(files)?.[0]?.unknownIslands).toEqual(['@/components/ghost'])
  })
})
