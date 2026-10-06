import { describe, expect, it } from 'vitest'

import { CI_STEPS, EXPECTED_SCRIPTS, scriptGaps } from './alignment.ts'

const aligned = { ...EXPECTED_SCRIPTS, ci: CI_STEPS.map((step) => `pnpm run ${step}`).join(' && ') }

describe('scriptGaps e `check:secrets`', () => {
  it('nella 0.12.0 lo chiede come avviso, assente o diverso, così la PR di Dependabot passa', () => {
    const missing = Object.fromEntries(Object.entries(aligned).filter(([name]) => name !== 'check:secrets'))

    expect(scriptGaps({ scripts: missing })).toEqual([
      {
        path: 'package.json',
        message: 'script `check:secrets` assente: atteso `officina check secrets`',
        severity: 'warning',
      },
    ])
    expect(scriptGaps({ scripts: { ...aligned, 'check:secrets': 'node secrets.mjs' } })).toEqual([
      {
        path: 'package.json',
        message: 'script `check:secrets` è `node secrets.mjs`: atteso `officina check secrets`',
        severity: 'warning',
      },
    ])
  })
})
