import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { plopCommand, plopEnv } from './run.ts'

describe('plopCommand', () => {
  it('lancia il plop del pacchetto con il suo plopfile e scrive nel progetto', () => {
    const [plopBin, plopfileFlag, plopfile, destFlag, dest, ...rest] = plopCommand(['section'], '/progetto')

    expect(existsSync(String(plopBin))).toBe(true)
    expect(existsSync(String(plopfile))).toBe(true)
    expect([plopfileFlag, destFlag, dest]).toEqual(['--plopfile', '--dest', '/progetto'])
    expect(rest).toEqual(['section'])
  })
})

describe('plopEnv', () => {
  it('passa sempre la fonte delle foto, e la scelta dei generatori solo quando è del progetto', () => {
    expect(plopEnv('required', 'cloudinary', { PATH: '/bin' })).toEqual({ PATH: '/bin', OFFICINA_IMAGES: 'cloudinary' })
    expect(plopEnv('project', 'local', {})).toEqual({ OFFICINA_IMAGES: 'local', OFFICINA_GENERATORS: 'project' })
  })
})
