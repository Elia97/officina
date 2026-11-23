import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { expression, inputs, named, runs, shell } from './test-helpers/action-steps.ts'
import { fakePnpm } from './test-helpers/fake-pnpm.ts'

const SMOKE = 'Smoke di produzione'
const BIN = fakePnpm()
const roots: string[] = []

afterAll(() => rmSync(BIN, { recursive: true, force: true }))
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function project(envFile?: string): string {
  const root = mkdtempSync(join(tmpdir(), 'officina-deploy-smoke-'))
  roots.push(root)
  if (envFile !== undefined) {
    mkdirSync(join(root, '.vercel'))
    writeFileSync(join(root, '.vercel/.env.production.local'), envFile)
  }
  return root
}

const smoke = (root: string, key: string) =>
  shell(SMOKE, root, { PATH: `${BIN}:${process.env.PATH}`, SITE_URL_ENV: key })

const PULLED = 'SITE_URL="https://oguns.it"\nRESEND_API_KEY="[SENSITIVE]"\n'

describe("il deploy e l'indirizzo del sito nello smoke", () => {
  it('`site-url-env` vale SITE_URL se il progetto non lo dice, ed entra solo nel passo dello smoke', () => {
    const receiving = runs.steps
      .filter((step) => JSON.stringify(step).includes('inputs.site-url-env'))
      .map(({ name }) => name)

    expect(inputs['site-url-env']).toMatchObject({ required: false, default: 'SITE_URL' })
    expect(receiving).toEqual([SMOKE])
    expect(named(SMOKE)).toMatchObject({ shell: 'bash', env: { SITE_URL_ENV: expression('inputs.site-url-env') } })
  })

  it("lo smoke riceve l'indirizzo dal file di vercel pull, e nessun'altra chiave", () => {
    const { status, stdout } = smoke(project(PULLED), 'SITE_URL')

    expect(status).toBe(0)
    expect(stdout).toMatch(/^pnpm run smoke:prod\n/)
    expect(stdout).toContain('\nSITE_URL=https://oguns.it\n')
    expect(stdout).not.toContain('RESEND_API_KEY')
  })

  it('legge la chiave che il progetto nomina', () => {
    const { status, stdout } = smoke(project('PUBLIC_SITE_URL=https://oguns.it\n'), 'PUBLIC_SITE_URL')

    expect(status).toBe(0)
    expect(stdout).toContain('\nPUBLIC_SITE_URL=https://oguns.it\n')
  })

  it("senza la chiave nel file lo smoke gira come prima: l'indirizzo è nel codice", () => {
    const { status, stdout } = smoke(project('RESEND_API_KEY="[SENSITIVE]"\n'), 'SITE_URL')

    expect(status).toBe(0)
    expect(stdout).toMatch(/^pnpm run smoke:prod\n/)
    expect(stdout).not.toContain('SITE_URL=')
  })

  it('con `site-url-env` vuoto non legge il file', () => {
    const { status, stdout } = smoke(project(), '')

    expect(status).toBe(0)
    expect(stdout).toMatch(/^pnpm run smoke:prod\n/)
  })

  it("si ferma prima dello smoke se l'indirizzo è una Secret", () => {
    const { status, stdout } = smoke(project('SITE_URL="[SENSITIVE]"\n'), 'SITE_URL')

    expect(status).toBe(1)
    expect(stdout).toContain('::error::SITE_URL è una variabile Secret su Vercel')
    expect(stdout).not.toContain('pnpm run smoke:prod')
  })

  it("si ferma su un nome che non è una variabile d'ambiente", () => {
    const { status, stdout } = smoke(project(PULLED), 'SITE-URL')

    expect(status).toBe(1)
    expect(stdout).toContain("::error::site-url-env vale «SITE-URL», che non è il nome di una variabile d'ambiente")
    expect(stdout).not.toContain('pnpm run smoke:prod')
  })
})
