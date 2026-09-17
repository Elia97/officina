import { afterEach, describe, expect, it, vi } from 'vitest'

import { CHECKS, run } from './bin.ts'
import { useFixtureProject } from './test-fixture.ts'

vi.mock('./gen/run.ts', () => ({ main: (args: string[]) => args.length }))
vi.mock('./gen/icons.ts', () => ({ main: (args: string[]) => 40 + args.length }))

useFixtureProject()

afterEach(() => {
  vi.restoreAllMocks()
})

const silence = () => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => void lines.push(line))
  vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line))
  return lines
}

describe('officina', () => {
  it('senza un comando che conosce stampa come si usa ed esce 2', async () => {
    const lines = silence()

    expect(await run([])).toBe(2)
    expect(await run(['check', 'nope'])).toBe(2)
    expect(lines.join('\n')).toContain('officina check <gate>')
  })

  it('check lancia il gate nominato con i suoi argomenti', async () => {
    const lines = silence()

    expect(await run(['check', 'routes'])).toBe(0)
    expect(lines.join('\n')).toMatch(/documenti/)
  })

  it('ogni gate nominato porta a un modulo che espone main', async () => {
    for (const load of Object.values(CHECKS)) expect(typeof (await load()).main).toBe('function')
  })

  it('gen passa al generatore gli argomenti che seguono', async () => {
    expect(await run(['gen', 'section', '--force'])).toBe(2)
  })

  it('gen icons va al disegnatore delle icone, non a plop, senza il proprio nome fra gli argomenti', async () => {
    expect(await run(['gen', 'icons'])).toBe(40)
  })

  it('doctor esce 1 sul progetto di prova, che non ha tutti i punti di aggancio', async () => {
    const lines = silence()

    expect(await run(['doctor'])).toBe(1)
    expect(lines.join('\n')).toContain('src/components/ui/heading.astro')
  })
})
