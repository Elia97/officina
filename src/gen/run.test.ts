import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { plopCommand } from './run.ts'

describe('plopCommand', () => {
  it('lancia il plop del pacchetto con il suo plopfile e scrive nel progetto', () => {
    const [plopBin, plopfileFlag, plopfile, destFlag, dest, ...rest] = plopCommand(['section'], '/progetto')

    expect(existsSync(String(plopBin))).toBe(true)
    expect(existsSync(String(plopfile))).toBe(true)
    expect([plopfileFlag, destFlag, dest]).toEqual(['--plopfile', '--dest', '/progetto'])
    expect(rest).toEqual(['section'])
  })
})
