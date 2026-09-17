import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { FIXTURE_ROOT as ROOT, useFixtureProject } from '../test-fixture.ts'
import { main as checkComments } from './comments.ts'
import { main as checkLanguage } from './language.ts'
import { main as checkPlaceholders } from './placeholders.ts'
import { main as checkRoadmap } from './roadmap.ts'
import { main as checkRoutes } from './routes.ts'

useFixtureProject()

// Un file scorretto scritto per davvero: i gate leggono dal repository, e senza un file che li
// faccia scattare si verifica solo che passino, mai che trovino qualcosa.
const withBrokenFile = <T>(name: string, content: string, fn: () => T): T => {
  const path = join(ROOT, 'scripts', name)
  writeFileSync(path, content)
  try {
    return fn()
  } finally {
    rmSync(path, { force: true })
  }
}

// I due gate girano sul repository vero: è il caso che conta, perché un gate che passa solo su
// un fixture inventato non dice niente sullo stato del progetto.
const captureOutput = <T>(fn: () => T): { exitCode: T; lines: string[] } => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    return { exitCode: fn(), lines }
  } finally {
    vi.restoreAllMocks()
  }
}

// I gate che leggono officina.config.ts sono asincroni: la spia va tolta dopo, non appena la
// promessa esiste, altrimenti l'output esce dopo che nessuno lo sta più ascoltando.
const captureAsync = async <T>(fn: () => Promise<T>): Promise<{ exitCode: T; lines: string[] }> => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  try {
    return { exitCode: await fn(), lines }
  } finally {
    vi.restoreAllMocks()
  }
}

describe('check:comments', () => {
  it('passa sul repository con --strict e dice quante righe sono commento', () => {
    const { exitCode, lines } = captureOutput(() => checkComments(['--strict']))
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toMatch(/righe sono commento/)
  })

  it('con --diff guarda solo ciò che il branch ha toccato', () => {
    const { exitCode, lines } = captureOutput(() => checkComments(['--diff', '--strict']))
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain('solo file toccati dal branch')
  })
})

describe('check:language', () => {
  it('passa sul repository e conta i file con prosa', () => {
    const { exitCode, lines } = captureOutput(() => checkLanguage([]))
    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toMatch(/file con prosa/)
  })

  it('in formato github non stampa nulla se non ha niente da annotare', () => {
    const { exitCode, lines } = captureOutput(() => checkLanguage(['--format', 'github']))
    expect(exitCode).toBe(0)
    expect(lines.filter((line) => line.startsWith('::'))).toEqual([])
  })
})

describe('i gate trovano i problemi, non solo li cercano', () => {
  it('check:comments respinge un blocco di prosa oltre le due righe', () => {
    const { exitCode, lines } = withBrokenFile(
      '__test-comments.ts',
      [
        '// Prima riga di prosa che continua oltre il limite',
        '// e prosegue su una seconda riga di prosa',
        '// e ancora su una terza riga di prosa.',
        'export const a = 1',
        '',
      ].join('\n'),
      () => captureOutput(() => checkComments(['--diff'])),
    )

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('__test-comments.ts')
    expect(lines.join('\n')).toMatch(/righe di prosa/)
  })

  it('check:language respinge la prosa scritta in inglese', () => {
    const { exitCode, lines } = withBrokenFile(
      '__test-language.ts',
      [
        '// This comment is written in English and the gate should notice that',
        '// because the words here are the ones that make it decide.',
        'export const b = 2',
        '',
      ].join('\n'),
      () => captureOutput(() => checkLanguage(['--diff'])),
    )

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('__test-language.ts')
  })

  it('check:comments con --strict respinge un file in cui i commenti prendono il sopravvento', () => {
    const denseSource = Array.from({ length: 8 }, (_, i) => [
      `// Nota ${i + 1}.`,
      ...['a', 'b', 'c', 'd'].map((name) => `export const ${name}${i} = ${i}`),
    ]).flat()
    const { lenient, strict } = withBrokenFile('__test-density.ts', [...denseSource, ''].join('\n'), () => ({
      lenient: captureOutput(() => checkComments(['--diff'])),
      strict: captureOutput(() => checkComments(['--diff', '--strict'])),
    }))

    expect(lenient.exitCode).toBe(0)
    expect(strict.exitCode).toBe(1)
    expect(strict.lines.join('\n')).toContain('__test-density.ts: 8/40 righe sono commento')
  })
})

describe('check:routes', () => {
  it('passa sul repository e conta i documenti', () => {
    const { exitCode, lines } = captureOutput(() => checkRoutes([]))

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toMatch(/documenti/)
  })

  it('segnala un rimando a una sezione che non esiste', () => {
    const { exitCode, lines } = withBrokenFile(
      '__test-routes.md',
      'see `docs/ARCHITECTURE.md` § Section That Does Not Exist\n',
      () => captureOutput(() => checkRoutes(['--diff'])),
    )

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('__test-routes.md')
  })
})

describe('check:roadmap', () => {
  it('passa sulla roadmap vera', async () => {
    const { exitCode, lines } = await captureAsync(() => checkRoadmap([]))

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toMatch(/giornate/)
  })
})

describe('check:placeholders', () => {
  it('sul template esce 1 e nomina i file che portano segnaposto', () => {
    const { exitCode, lines } = captureOutput(() => checkPlaceholders([]))

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('src/lib/company.ts')
    expect(lines.join('\n')).toContain('src/i18n/strings/it.ts')
  })

  it("con --env nomina la chiave che manca nell'ambiente scaricato", () => {
    const { exitCode, lines } = withBrokenFile(
      '__test-env.local',
      'CONTACT_FROM_EMAIL="hello@acme.test"\nCONTACT_FROM_NAME="Acme"\n',
      () => captureOutput(() => checkPlaceholders(['--env', 'scripts/__test-env.local'])),
    )

    expect(exitCode).toBe(1)
    expect(lines.join('\n')).toContain('CONTACT_TO_EMAIL')
  })
})

describe('casi limite', () => {
  it("non divide per zero quando non c'è nessun file da guardare", () => {
    const { exitCode, lines } = captureOutput(() => checkComments(['--base', 'HEAD', '--head', 'HEAD']))

    expect(exitCode).toBe(0)
    expect(lines.join('\n')).toContain('0/0')
  })
})
