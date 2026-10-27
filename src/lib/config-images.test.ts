import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { imagesSetting, loadConfig } from './config.ts'

const roots: string[] = []

function config(body: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-images-'))
  roots.push(root)
  writeFileSync(join(root, 'officina.config.mjs'), `export default ${body}\n`)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('imagesSetting', () => {
  it("senza dichiarazione le foto sono locali: il silenzio vale `'local'`", () => {
    expect(imagesSetting({})).toBe('local')
  })

  it('restituisce la fonte dichiarata', () => {
    expect(imagesSetting({ images: 'cloudinary' })).toBe('cloudinary')
    expect(imagesSetting({ images: 'local' })).toBe('local')
  })

  it("accetta 'cloudinary' e rifiuta un valore inventato, nominando la voce", async () => {
    expect(await loadConfig(config("{ images: 'cloudinary' }"))).toEqual({ images: 'cloudinary' })
    await expect(loadConfig(config("{ images: 'cdn' }"))).rejects.toThrow(
      "images: atteso 'local' oppure 'cloudinary', ricevuto una stringa",
    )
  })
})
