import { describe, expect, it } from 'vitest'

import { onDemandPatterns } from './vercel-build.ts'

const route = (routeData: Record<string, unknown>) => ({ scripts: [], styles: [], routeData })

const entry = (manifest: unknown) => ({
  path: 'entry.mjs',
  source: `var _manifest = deserializeManifest(${JSON.stringify(manifest)});`,
})

const accepts = (patterns: RegExp[] | null, path: string) => (patterns ?? []).some((pattern) => pattern.test(path))

describe('onDemandPatterns', () => {
  it('prende ogni rotta resa a richiesta, di qualunque tipo e origine, e lascia le prerenderizzate', () => {
    const manifest = {
      routes: [
        route({ type: 'page', origin: 'project', prerender: false, route: '/blog/[slug]' }),
        route({ type: 'endpoint', origin: 'project', prerender: false, route: '/api/health' }),
        route({ type: 'fallback', origin: 'internal', prerender: false, route: '/' }),
        route({ type: 'page', origin: 'project', prerender: true, route: '/chi-siamo' }),
        route({ type: 'page', origin: 'project', prerender: false }),
        { scripts: [] },
      ],
    }
    const patterns = onDemandPatterns([{ path: 'chunks/a.mjs', source: 'export {}' }, entry(manifest)])

    expect(patterns).toHaveLength(3)
    for (const path of ['/blog/ciao', '/api/health', '/']) expect(accepts(patterns, path)).toBe(true)
    expect(accepts(patterns, '/chi-siamo')).toBe(false)
  })

  it('usa il pattern di Astro, che regge i segmenti misti, e ripiega su quello di officina se manca o non compila', () => {
    const manifest = {
      routes: [
        route({ prerender: false, route: '/blog/[slug].md', pattern: '^\\/blog\\/([^/]+?)\\.md$' }),
        route({ prerender: false, route: '/post-[id]', pattern: '^\\/post-([^/]+?)$' }),
        route({ prerender: false, route: '/guida/[slug]', pattern: '(' }),
      ],
    }
    const patterns = onDemandPatterns([entry(manifest)])

    expect(accepts(patterns, '/blog/ciao.md')).toBe(true)
    expect(accepts(patterns, '/blog/cancellato')).toBe(false)
    expect(accepts(patterns, '/post-42')).toBe(true)
    expect(accepts(patterns, '/guida/inizio')).toBe(true)
  })

  it('senza un manifest che si riconosce risponde null, e con un manifest senza rotte una lista vuota', () => {
    expect(onDemandPatterns([{ path: 'entry.mjs', source: 'export {}' }])).toBeNull()
    expect(onDemandPatterns([entry({})])).toEqual([])
  })
})
