import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll } from 'vitest'

export const FIXTURE_ROOT = fileURLToPath(new URL('../test/fixture-project/', import.meta.url))

// I gate leggono dalla cartella corrente, come in un progetto vero: i test che hanno bisogno di
// file su disco si spostano nel progetto di prova e tornano indietro alla fine.
export function useFixtureProject(): void {
  let previous = ''
  beforeAll(() => {
    previous = process.cwd()
    process.chdir(FIXTURE_ROOT)
  })
  afterAll(() => {
    process.chdir(previous)
  })
}
