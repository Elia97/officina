import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ghApi } from './github.ts'
import { cleanFakeGh, useFakeGh } from './test-helpers/fake-gh.ts'

afterEach(cleanFakeGh)

describe('ghApi', () => {
  it("passa gli argomenti a gh api e restituisce l'output", () => {
    const calls = useFakeGh({ FAKE_GH_STATUS: '{"statuses":[]}' })

    expect(ghApi(['repos/{owner}/{repo}/commits/abc/status'])).toBe('{"statuses":[]}\n')
    expect(calls()).toEqual(['api repos/{owner}/{repo}/commits/abc/status'])
  })

  it('su un errore porta lo stderr di gh, o il codice se gh tace', () => {
    useFakeGh({ FAKE_GH_EXIT: '1', FAKE_GH_STDERR: 'HTTP 403: Resource not accessible by integration' })
    expect(() => ghApi(['x'])).toThrow('HTTP 403: Resource not accessible by integration')

    vi.stubEnv('FAKE_GH_STDERR', '')
    expect(() => ghApi(['x'])).toThrow('gh api x è uscito con 1')
  })

  it('senza gh sul PATH lo dice', () => {
    const empty = mkdtempSync(join(tmpdir(), 'officina-nogh-'))
    vi.stubEnv('PATH', empty)
    try {
      expect(() => ghApi(['x'])).toThrow(/^gh non si lancia: /)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})
