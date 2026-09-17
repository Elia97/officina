import { beforeEach, describe, expect, it, vi } from 'vitest'

const execSync = vi.hoisted(() => vi.fn())
vi.mock('node:child_process', () => ({ execSync }))

const { postGenAction } = await import('./post-gen.mjs')

beforeEach(() => {
  execSync.mockReset()
})

describe('postGenAction', () => {
  it('runs astro sync then the repo gate, both in the generated root', () => {
    const result = postGenAction('/tmp/some-root')()

    expect(execSync.mock.calls.map(([command]) => command)).toEqual(['pnpm exec astro sync', 'pnpm run check'])
    for (const [, options] of execSync.mock.calls) expect(options).toMatchObject({ cwd: '/tmp/some-root' })
    expect(result).toBe('astro sync + biome check passed')
  })

  it('throws when a check fails, instead of reporting success', () => {
    execSync.mockImplementation(() => {
      throw new Error('biome found 3 errors')
    })

    expect(() => postGenAction('/tmp/some-root')()).toThrow(/Post-generation checks failed/)
  })

  it('keeps the underlying failure as the cause, so the real error is not lost', () => {
    const underlying = new Error('biome found 3 errors')
    execSync.mockImplementation(() => {
      throw underlying
    })

    expect(() => postGenAction('/tmp/some-root')()).toThrow(
      expect.objectContaining({ cause: underlying }) as unknown as Error,
    )
  })

  it('carries the generator-specific rollback hint when one is given', () => {
    execSync.mockImplementation(() => {
      throw new Error('nope')
    })

    expect(() => postGenAction('/tmp/some-root', 'discard ONLY the injected hunks')()).toThrow(
      /discard ONLY the injected hunks/,
    )
  })

  it('falls back to the leftovers warning when no hint is given', () => {
    execSync.mockImplementation(() => {
      throw new Error('nope')
    })

    expect(() => postGenAction('/tmp/some-root')()).toThrow(/left on disk/)
  })
})
