import { afterEach, describe, expect, it, vi } from 'vitest'

import { cleanScopeRepos, repoWithChange, stubEvent } from '../lib/test-helpers/scope-repo.ts'
import { main as scope } from './scope.ts'

afterEach(cleanScopeRepos)

function run(): { code: number; out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void out.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void err.push(line))
  const code = scope()
  vi.restoreAllMocks()
  return { code, out, err }
}

describe('officina scope su un push', () => {
  it('di soli documenti stampa docs-only=true, e la ragione su stderr', () => {
    const before = repoWithChange((write) => write('docs/ARCHITECTURE.md', '# Architettura\n'))
    stubEvent('push', { before })

    expect(run()).toEqual({ code: 0, out: ['docs-only=true'], err: ['percorso veloce: solo documenti (1 file)'] })
  })

  it('che tocca il codice stampa docs-only=false, e nomina il file', () => {
    const before = repoWithChange((write) => write('src/lib/site.ts', "export const SITE = { url: '' }\n"))
    stubEvent('push', { before })

    expect(run()).toEqual({
      code: 0,
      out: ['docs-only=false'],
      err: ['percorso completo: src/lib/site.ts non è un documento'],
    })
  })
})
