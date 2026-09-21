import { afterEach, describe, expect, it, vi } from 'vitest'

import { cliOptions, exitCode, isGenerated, missingInput, printFindings, readLines } from './cli.ts'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const printedLines = (fn: () => void): string[] => {
  const lines: string[] = []
  vi.spyOn(console, 'log').mockImplementation((line: string) => {
    lines.push(line)
  })
  fn()
  return lines
}

describe('cliOptions', () => {
  it('parte dai default quando non riceve argomenti', () => {
    vi.stubEnv('GITHUB_ACTIONS', undefined)

    expect(cliOptions([])).toMatchObject({
      diff: false,
      strict: false,
      format: 'text',
    })
  })

  it('--base implica --diff: chiedere una base è chiedere un confronto', () => {
    expect(cliOptions(['--base', 'main'])).toMatchObject({
      base: 'main',
      diff: true,
    })
  })

  it('sceglie il formato annotazioni quando gira dentro GitHub Actions', () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    expect(cliOptions([]).format).toBe('github')
  })

  it("un formato esplicito vince sull'ambiente", () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    expect(cliOptions(['--format', 'text']).format).toBe('text')
  })
})

describe('isGenerated', () => {
  it.each(['src/routeTree.gen.ts', 'src/schema.gen.tsx', 'src/api.gen.mts'])('%s è generato', (path) => {
    expect(isGenerated(path)).toBe(true)
  })

  it.each(['src/generated.ts', 'src/gen.ts', 'src/routeTree.gen.ts.bak'])('%s non lo è', (path) => {
    expect(isGenerated(path)).toBe(false)
  })
})

describe('exitCode', () => {
  const errorFinding = {
    path: 'a.ts',
    message: 'x',
    severity: 'error' as const,
  }
  const warningFinding = { path: 'a.ts', message: 'x', severity: 'warning' as const }

  it('esce 1 sugli errori, sempre', () => {
    expect(exitCode([errorFinding], false)).toBe(1)
  })

  it('gli avvisi bloccano solo con --strict', () => {
    expect(exitCode([warningFinding], false)).toBe(0)
    expect(exitCode([warningFinding], true)).toBe(1)
  })

  it('nessun ritrovamento, nessun errore', () => {
    expect(exitCode([], true)).toBe(0)
  })
})

describe('printFindings', () => {
  const finding = {
    path: 'src/a.ts',
    line: 12,
    message: 'comment too long',
    severity: 'error' as const,
  }

  it('in formato testo mostra percorso, riga e messaggio', () => {
    const [line] = printedLines(() => printFindings([finding], 'text'))
    expect(line).toContain('src/a.ts:12')
    expect(line).toContain('comment too long')
  })

  it('omette la riga quando il ritrovamento riguarda il file intero', () => {
    const { line: _line, ...withoutLine } = finding
    const [line] = printedLines(() => printFindings([withoutLine], 'text'))
    expect(line).toContain('src/a.ts:')
    expect(line).not.toMatch(/src\/a\.ts:\d/)
  })

  it('in formato github emette un comando di annotazione', () => {
    const [line] = printedLines(() => printFindings([finding], 'github'))
    expect(line).toBe('::error file=src/a.ts,line=12::comment too long')
  })

  it('in github omette il parametro line quando il ritrovamento è sul file', () => {
    const { line: _line, ...withoutLine } = finding
    const [line] = printedLines(() => printFindings([withoutLine], 'github'))
    expect(line).toBe('::error file=src/a.ts::comment too long')
  })

  it('distingue gli avvisi dagli errori con un segno diverso', () => {
    const warningFinding = { ...finding, severity: 'warning' as const }
    const [line] = printedLines(() => printFindings([warningFinding], 'text'))
    expect(line).toContain('·')
    expect(line).not.toContain('✗')
  })

  it('codifica i caratteri che romperebbero il comando di annotazione', () => {
    const [line] = printedLines(() => printFindings([{ ...finding, message: 'first\nsecond 50% more' }], 'github'))
    expect(line).toContain('first%0Asecond 50%25 more')
  })
})

describe('readLines', () => {
  it('numera da uno e non inventa una riga finale', () => {
    expect(readLines('a\nb\n')).toEqual([
      { n: 1, text: 'a' },
      { n: 2, text: 'b' },
    ])
  })
})

describe('missingInput', () => {
  const errorLines = (fn: () => void): string[] => {
    const lines: string[] = []
    vi.spyOn(console, 'error').mockImplementation((line: string) => {
      lines.push(line)
    })
    fn()
    return lines
  }

  it('su un percorso che esiste non dice niente', () => {
    let missing = true
    const lines = errorLines(() => {
      missing = missingInput('package.json', 'serve a qualcosa')
    })

    expect(missing).toBe(false)
    expect(lines).toEqual([])
  })

  it('su un percorso che non esiste nomina il file e dice a cosa serve', () => {
    let missing = false
    const lines = errorLines(() => {
      missing = missingInput('public/favicon.svg', 'è il disegno da cui escono i PNG')
    })

    expect(missing).toBe(true)
    expect(lines.join('\n')).toContain("public/favicon.svg non c'è: è il disegno da cui escono i PNG.")
  })
})
