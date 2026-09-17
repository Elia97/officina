import { describe, expect, it } from 'vitest'

import { type Budget, budgetFor, CSS_BUDGET_GZIP, cssBudgetFailure, deferredClosure } from './bundle-budget.ts'

const motion: Budget = { label: 'motion', matches: (route) => route === '/', maxGzip: 72 * 1024 }

describe('i budget dichiarati dal progetto', () => {
  it('vengono prima del default, per le rotte che accettano', () => {
    expect(budgetFor('/', [motion])).toBe(motion)
  })

  it('lasciano al default le rotte che nessuna classe accetta', () => {
    expect(budgetFor('/contatti', [motion]).label).toBe('default')
  })

  it('possono sostituire il default con una classe finale che accetta tutto', () => {
    const wide: Budget = { label: 'default', matches: () => true, maxGzip: 90 * 1024 }

    expect(budgetFor('/contatti', [motion, wide]).maxGzip).toBe(90 * 1024)
  })
})

describe('il tetto del CSS dichiarato dal progetto', () => {
  it('sostituisce quello del pacchetto, nel confronto e nel messaggio', () => {
    const sheets = [{ file: 'main.css', gzip: CSS_BUDGET_GZIP + 1024 }]

    expect(cssBudgetFailure(sheets, 14 * 1024)).toBeNull()
    expect(cssBudgetFailure(sheets, 10 * 1024)).toContain('> 10.0 KB')
  })
})

describe('deferredClosure', () => {
  it('ignora un nome raggiunto che non è fra i chunk letti', () => {
    expect(deferredClosure(new Set(['ghost.js']), new Map())).toEqual(new Set())
  })
})
