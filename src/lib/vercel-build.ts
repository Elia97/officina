import { posix } from 'node:path'

export type ServerFile = { path: string; source: string }

export type SsrRoute = { route: string; entries: string[]; unmapped: boolean; unknownIslands: string[] }

type RawScript = { type?: string; value?: string }

type RawRoute = {
  scripts?: RawScript[]
  routeData?: { route?: unknown; component?: unknown; type?: string; origin?: string; prerender?: boolean }
}

type SsrPage = { scripts: RawScript[]; route: string; component: string }

type RawManifest = {
  routes?: RawRoute[]
  entryModules?: Record<string, string>
  inlinedScripts?: [string, string][]
}

const MANIFEST_CALL = 'deserializeManifest({'
const ASSET = /^_astro\/([^/]+\.js)$/
const RENDERER_RUNTIME = /^@astrojs\/[\w-]+\/client\.js$/
const COMPONENT_SCRIPT = '?astro&type=script'
const PAGE_ROUTE = /\["(src\/pages\/[^"]+)", (_page\d+)\]/g
const PAGE_IMPORT = /(?:var|const|let) (_page\d+) = \(\) => import\("(\.{1,2}\/[^"]+\.mjs)"\)/g
const ISLAND_PATH = /"client:component-path":\s*"([^"]+)"/g
const SERVER_IMPORT = /(?<![\w$.])(?:from|import)\s*"(\.{1,2}\/[^"]+\.mjs)"/g

const resolve = (from: string, specifier: string): string => posix.join(posix.dirname(from), specifier)

function objectLiteralAt(source: string, start: number): string | null {
  let depth = 0
  let quoted = false
  for (let i = start; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '\\') i++
      else if (char === '"') quoted = false
    } else if (char === '"') quoted = true
    else if (char === '{') depth++
    else if (char === '}' && --depth === 0) return source.slice(start, i + 1)
  }
  return null
}

function parseManifest(source: string): RawManifest | null {
  const call = source.indexOf(MANIFEST_CALL)
  const literal = call === -1 ? null : objectLiteralAt(source, call + MANIFEST_CALL.length - 1)
  if (literal === null) return null
  try {
    return JSON.parse(literal) as RawManifest
  } catch {
    return null
  }
}

function pageChunks(file: ServerFile): Map<string, string> {
  const chunkOf = new Map(
    [...file.source.matchAll(PAGE_IMPORT)].map(([, name, path]) => [name, resolve(file.path, path as string)]),
  )
  const pages = new Map<string, string>()
  for (const [, component, name] of file.source.matchAll(PAGE_ROUTE)) {
    const chunk = chunkOf.get(name)
    if (chunk !== undefined) pages.set(component as string, chunk)
  }
  return pages
}

// Il file del manifest nomina ogni modulo del sito: seguirlo attribuirebbe a ogni pagina tutte le isole.
function serverClosure(start: string, files: ReadonlyMap<string, string>, manifestFile: string): string[] {
  const reached = new Map<string, string>()
  const queue = [start]
  while (queue.length > 0) {
    const path = queue.pop() as string
    const source = files.get(path)
    if (path === manifestFile || reached.has(path) || source === undefined) continue
    reached.set(path, source)
    for (const [, specifier] of source.matchAll(SERVER_IMPORT)) queue.push(resolve(path, specifier as string))
  }
  return [...reached.values()]
}

const assetOf = (value: string | undefined): string | undefined => value?.match(ASSET)?.[1]

function clientModules(manifest: RawManifest): Map<string, string> {
  const inlined = new Set((manifest.inlinedScripts ?? []).map(([specifier]) => specifier))
  const modules = new Map<string, string>()
  for (const [specifier, value] of Object.entries(manifest.entryModules ?? {})) {
    const asset = assetOf(value)
    if (asset !== undefined && !inlined.has(specifier)) modules.set(specifier, asset)
  }
  return modules
}

function routeEntries(page: SsrPage, texts: readonly string[], modules: ReadonlyMap<string, string>): string[] {
  const used = [...modules].filter(
    ([specifier]) => !RENDERER_RUNTIME.test(specifier) && texts.some((text) => text.includes(`"${specifier}"`)),
  )
  const hasIsland = used.some(([specifier]) => !specifier.includes(COMPONENT_SCRIPT))
  const runtimes = hasIsland ? [...modules].filter(([specifier]) => RENDERER_RUNTIME.test(specifier)) : []
  const scripts = page.scripts.filter((script) => script.type === 'external').map((script) => assetOf(script.value))
  const names = [...scripts, ...[...used, ...runtimes].map(([, asset]) => asset)]
  return [...new Set(names.filter((name) => name !== undefined))].sort()
}

const unknownIslands = (texts: readonly string[], modules: ReadonlyMap<string, string>): string[] =>
  [...new Set(texts.flatMap((text) => [...text.matchAll(ISLAND_PATH)].map(([, path]) => path as string)))]
    .filter((path) => !modules.has(path))
    .sort()

function ssrPage({ scripts = [], routeData }: RawRoute): SsrPage[] {
  if (routeData?.type !== 'page' || routeData.origin !== 'project' || routeData.prerender !== false) return []
  const { route, component } = routeData
  return typeof route === 'string' && typeof component === 'string' ? [{ scripts, route, component }] : []
}

export function ssrRoutes(files: readonly ServerFile[]): SsrRoute[] | null {
  for (const file of files) {
    const manifest = parseManifest(file.source)
    if (manifest !== null) return routesOf(file, manifest, files)
  }
  return null
}

function routesOf(host: ServerFile, manifest: RawManifest, files: readonly ServerFile[]): SsrRoute[] {
  const sources = new Map(files.map((file) => [file.path, file.source]))
  const chunks = pageChunks(host)
  const modules = clientModules(manifest)
  return (manifest.routes ?? []).flatMap(ssrPage).map((page) => {
    const chunk = chunks.get(page.component)
    const texts = chunk === undefined ? [] : serverClosure(chunk, sources, host.path)
    return {
      route: page.route,
      entries: routeEntries(page, texts, modules),
      unmapped: chunk === undefined,
      unknownIslands: unknownIslands(texts, modules),
    }
  })
}
