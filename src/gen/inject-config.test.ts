import { afterEach, describe, expect, it } from 'vitest'
import { assertInjectable, injectCollection } from './inject-config.mjs'
import { cleanupRoots, makeRoot, read } from './test-helpers/gen-fixture.ts'

const CONFIG = 'src/content.config.ts'
const config = (root: string) => read(root, CONFIG)

/** ts-morph emette grezzo (doppi apici, punto e virgola); Biome normalizza nel passo post-gen. */
const block = (root: string, camel: string) =>
  config(root)
    .slice(config(root).indexOf(`const ${camel} = defineCollection(`))
    .split('\n})')[0] as string

afterEach(cleanupRoots)

describe('contract checks on content.config.ts', () => {
  it('passes against the real file, which is the actual contract', () => {
    expect(() => assertInjectable({ root: makeRoot(), camel: 'posts', kebab: 'posts' })).not.toThrow()
  })

  it('refuses when the `collections` variable is gone', () => {
    const root = makeRoot({ [CONFIG]: 'export const somethingElse = {}' })

    expect(() => assertInjectable({ root, camel: 'posts', kebab: 'posts' })).toThrow(/no `collections` variable/)
  })

  it('refuses when `collections` is not exported', () => {
    const root = makeRoot({ [CONFIG]: 'const collections = {}' })

    expect(() => assertInjectable({ root, camel: 'posts', kebab: 'posts' })).toThrow(/is not exported/)
  })

  it('refuses when `collections` is not an object literal, since there is nowhere to register', () => {
    const root = makeRoot({ [CONFIG]: 'export const collections = buildCollections()' })

    expect(() => assertInjectable({ root, camel: 'posts', kebab: 'posts' })).toThrow(/not initialized/)
  })

  it('refuses a name already registered as a shorthand', () => {
    const root = makeRoot({ [CONFIG]: 'export const collections = { posts }' })

    expect(() => assertInjectable({ root, camel: 'posts', kebab: 'posts' })).toThrow(/already registered/)
  })

  it('refuses a dashed name already registered as a quoted key', () => {
    const root = makeRoot({ [CONFIG]: "export const collections = { 'blog-posts': blogPosts }" })

    expect(() => assertInjectable({ root, camel: 'blogPosts', kebab: 'blog-posts' })).toThrow(/already registered/)
  })

  it('refuses when the const it would inject would shadow an existing binding', () => {
    const root = makeRoot({ [CONFIG]: "import { posts } from './x'\nexport const collections = {}" })

    expect(() => assertInjectable({ root, camel: 'posts', kebab: 'posts' })).toThrow(/already taken/)
  })
})

describe('injectCollection', () => {
  it('adds the schema import, the defineCollection const and the registration', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'posts', kebab: 'posts', document: true })

    const written = config(root)
    expect(written).toMatch(/import \{ postsSchema \} from ["']@\/lib\/schemas\/posts["']/)
    expect(written).toContain('const posts = defineCollection({')
    expect(block(root, 'posts')).toContain("base: './src/content/posts'")
    expect(written).toMatch(/collections = \{[\s\S]*\bposts\b/)
  })

  it('leaves the injection-point comment inside the literal', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'posts', kebab: 'posts', document: true })

    expect(config(root)).toMatch(/collections = \{[\s\S]*INJECTION POINT/)
  })

  it('reuses the schema import left behind by a partial rollback', () => {
    const root = makeRoot({
      [CONFIG]: [
        "import { defineCollection } from 'astro:content'",
        "import { glob } from 'astro/loaders'",
        "import { postsSchema } from '@/lib/schemas/posts'",
        '',
        'export const collections = {}',
      ].join('\n'),
    })

    injectCollection({ root, camel: 'posts', kebab: 'posts', document: true })

    expect(config(root).match(/@\/lib\/schemas\/posts/g)).toHaveLength(1)
  })
})

describe('the loader the archetype gets', () => {
  it('gives a document collection the markdown pattern and no generateId override', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'posts', kebab: 'posts', document: true })

    expect(block(root, 'posts')).toContain("pattern: '**/*.md'")
    expect(block(root, 'posts')).not.toContain('generateId:')
  })

  it('gives a data collection the yaml pattern and the raw-path generateId', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'authors', kebab: 'authors', document: false })

    expect(block(root, 'authors')).toContain("pattern: '**/*.{yaml,yml}'")
    expect(block(root, 'authors')).toContain('generateId: ({ entry }) => entry.replace(')
  })

  it('registra una collection a sezioni sul suo barrel, con il generateId della homepage', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'about', kebab: 'about', document: false, sections: true })

    expect(config(root)).toMatch(/import \{ aboutCollectionSchema \} from ["']@\/lib\/schemas\/about["']/)
    expect(block(root, 'about')).toContain('schema: aboutCollectionSchema')
    expect(block(root, 'about')).toContain('generateId: ({ entry }) => entry.replace(')
  })

  it('quotes a dashed collection key instead of using a shorthand', () => {
    const root = makeRoot()

    injectCollection({ root, camel: 'blogPosts', kebab: 'blog-posts', document: true })

    expect(config(root)).toContain("'blog-posts': blogPosts")
  })
})
