import { describe, expect, it } from 'vitest'

import { cleanOutput, duration, excerpt, failureReport, gateSteps, header, logName, stepLine } from './gate.ts'

const VETRINA_CI =
  'biome ci --error-on-warnings . && pnpm run typecheck && pnpm run check:deadcode && pnpm run check:language && pnpm run check:routes && pnpm run check:roadmap && pnpm run check:comments && pnpm run doctor && pnpm run test && pnpm run check:health'

describe('gateSteps', () => {
  it('divide `ci` sugli `&&` e aggiunge audit:diff e build', () => {
    const plan = gateSteps({ ci: VETRINA_CI, 'audit:diff': 'fallow audit', build: 'astro build', dev: 'astro dev' })

    expect('error' in plan).toBe(false)
    if ('error' in plan) return
    expect(plan.ciParts).toBe(10)
    expect(plan.steps.map((step) => step.name)).toEqual([
      'biome ci --error-on-warnings .',
      'typecheck',
      'check:deadcode',
      'check:language',
      'check:routes',
      'check:roadmap',
      'check:comments',
      'doctor',
      'test',
      'check:health',
      'audit:diff',
      'build',
    ])
    expect(plan.steps[0]?.command).toBe('biome ci --error-on-warnings .')
    expect(plan.steps[1]?.command).toBe('pnpm run typecheck')
    expect(plan.steps.at(-1)?.command).toBe('pnpm run build')
  })

  it('senza audit:diff né build lancia soltanto ci', () => {
    const plan = gateSteps({ ci: 'pnpm run lint && pnpm run test' })

    expect(plan).toEqual({
      steps: [
        { name: 'lint', command: 'pnpm run lint' },
        { name: 'test', command: 'pnpm run test' },
      ],
      ciParts: 2,
    })
  })

  it.each([
    'pnpm run lint || true',
    'pnpm run lint; pnpm run test',
    'pnpm run lint | tee out.log',
    'pnpm run lint & pnpm run test',
    'test "$(git status --short)" = ""',
    'echo `date`',
  ])('con altra sintassi di shell lancia `ci` intero: %s', (ci) => {
    expect(gateSteps({ ci, build: 'tsc' })).toEqual({
      steps: [
        { name: 'ci', command: 'pnpm run ci' },
        { name: 'build', command: 'pnpm run build' },
      ],
      ciParts: 1,
    })
  })

  it('senza `ci` dice che manca', () => {
    expect(gateSteps({ build: 'tsc' })).toEqual({ error: '`package.json` non ha lo script `ci`' })
  })
})

describe('output di un passo', () => {
  // Due righe di `biome ci` scritte su un file: colori carattere per carattere e un link OSC 8.
  const BIOME =
    '\u001b[0msrc/a.ts\u001b[0m\u001b[0m:\u001b[0m\u001b[0m19\u001b[0m \u001b]8;;https://biomejs.dev/linter/rules/no-explicit-any\u001b\\lint/suspicious/noExplicitAny\u001b]8;;\u001b\\   \n\u001b[31mFound \u001b[0m\u001b[31m1\u001b[0m\u001b[31m error.\u001b[0m\n'

  it('cleanOutput toglie colori, link e spazi in coda', () => {
    expect(cleanOutput(BIOME)).toBe('src/a.ts:19 lint/suspicious/noExplicitAny\nFound 1 error.\n')
  })

  it("excerpt toglie la riga `$` di pnpm, l'ELIFECYCLE e le righe vuote ripetute", () => {
    const output = '$ astro check\n\nerrore uno\n\n\n\nerrore due\n[ELIFECYCLE] Command failed with exit code 1.\n\n'

    expect(excerpt(output)).toEqual({ lines: ['errore uno', '', 'errore due'], hidden: 0 })
  })

  it('excerpt taglia e dice quante righe restano', () => {
    const output = Array.from({ length: 65 }, (_, i) => `riga ${i + 1}`).join('\n')

    const { lines, hidden } = excerpt(output)

    expect(lines).toHaveLength(60)
    expect(lines.at(-1)).toBe('riga 60')
    expect(hidden).toBe(5)
  })

  it('excerpt di un passo muto è vuoto', () => {
    expect(excerpt('$ fallow dead-code\n\n')).toEqual({ lines: [], hidden: 0 })
  })
})

describe('righe del rapporto', () => {
  it('duration in secondi con la virgola, e in minuti sopra i 60', () => {
    expect(duration(1449)).toBe('1,4 s')
    expect(duration(29_600)).toBe('29,6 s')
    expect(duration(61_400)).toBe('1 min 1 s')
  })

  it('header conta i passi di ci, o nomina ci quando è intero', () => {
    const split = gateSteps({ ci: 'pnpm run a && pnpm run b', 'audit:diff': 'x', build: 'y' })
    const whole = gateSteps({ ci: 'a || b', build: 'y' })

    expect('error' in split || header(split)).toBe('officina gate — 4 passi: i 2 di ci, audit:diff, build')
    expect('error' in whole || header(whole)).toBe('officina gate — 2 passi: ci, build')
  })

  it('stepLine allinea nomi e durate', () => {
    expect(stepLine('test', true, 29_600, 10)).toBe('  ✓ test           29,6 s')
    expect(stepLine('typecheck', false, 12_100, 10)).toBe('  ✗ typecheck      12,1 s')
  })

  it('logName numera i passi e rende sicuro il nome', () => {
    expect(logName(1, { name: 'check:deadcode', command: '' })).toBe('02-check_deadcode.log')
    expect(logName(0, { name: 'biome ci --error-on-warnings .', command: '' })).toBe(
      '01-biome_ci_--error-on-warnings_..log',
    )
  })
})

describe('failureReport', () => {
  const step = { name: 'typecheck', command: 'pnpm run typecheck' }
  const log = 'node_modules/.cache/officina/gate/02-typecheck.log'

  it("rientra l'estratto, dice dove si è fermato e dove sta il log", () => {
    expect(failureReport(step, '$ astro check\nerrore\n\nResult: 1 error\n', 10, log)).toEqual([
      '',
      '  errore',
      '',
      '  Result: 1 error',
      '',
      '  Fermo su typecheck: 10 passi non lanciati.',
      `  Log completo: ${log}`,
    ])
  })

  it("con un passo solo dopo lo dice al singolare, e sull'ultimo non lo dice", () => {
    expect(failureReport(step, 'errore', 1, log)).toContain('  Fermo su typecheck: 1 passo non lanciato.')
    expect(failureReport(step, 'errore', 0, log).join('\n')).not.toContain('Fermo su')
  })

  it('un passo rosso senza output lo dichiara, uno lungo dice quanto resta nel log', () => {
    const long = Array.from({ length: 70 }, (_, i) => `riga ${i}`).join('\n')

    expect(failureReport(step, '', 0, log)).toContain('  (nessun output)')
    expect(failureReport(step, long, 0, log)).toContain('  … altre 10 righe nel log')
  })
})
