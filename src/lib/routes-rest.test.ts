import { describe, expect, it } from 'vitest'

import { expectedRoutes } from './routes.ts'

describe('rest routes', () => {
  const patternsOf = (file: string) =>
    expectedRoutes([{ file, source: 'export const prerender = true' }], 'src/pages').patterns

  it('matches several path segments, unlike a single dynamic segment', () => {
    const [rest] = patternsOf('src/pages/blog/[...slug].astro')
    const [single] = patternsOf('src/pages/blog/[slug].astro')

    expect(rest?.pattern.test('/blog/2026/03/titolo')).toBe(true)
    expect(single?.pattern.test('/blog/2026/03/titolo')).toBe(false)
  })

  it('matches the bare prefix too: a paginated archive emits its first page without the segment', () => {
    const [rest] = patternsOf('src/pages/blog/[...page].astro')

    expect(rest?.pattern.test('/blog')).toBe(true)
    expect(rest?.pattern.test('/blog/2')).toBe(true)
  })
})
