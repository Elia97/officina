import { describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  spawnSync: () => ({ status: 1, stdout: '', stderr: '' }),
}))

const { trackedAndUntracked } = await import('./git.ts')

describe('git che fallisce senza dire niente', () => {
  it("nomina il comando nell'errore quando stderr è vuoto", () => {
    expect(() => trackedAndUntracked()).toThrow('git ls-files -z fallito')
  })
})
