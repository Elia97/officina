import { describe, expect, it } from 'vitest'

import { CSS_BUDGET_GZIP, cssBudgetFailure, heaviestStylesheet } from './bundle-budget.ts'

describe('cssBudgetFailure', () => {
  const sheet = (file: string, gzip: number) => ({ file, gzip })

  it('passes a stylesheet under the budget, and one exactly at it', () => {
    expect(cssBudgetFailure([sheet('main.css', CSS_BUDGET_GZIP - 1)])).toBeNull()
    expect(cssBudgetFailure([sheet('main.css', CSS_BUDGET_GZIP)])).toBeNull()
  })

  it('has nothing to weigh on a build with no stylesheet at all', () => {
    expect(cssBudgetFailure([])).toBeNull()
  })

  it('weighs the page groups apart, since a route links only one of them', () => {
    const almost = Math.floor(CSS_BUDGET_GZIP * 0.9)

    expect(cssBudgetFailure([sheet('main.css', almost), sheet('blog.css', almost)])).toBeNull()
  })

  it('reports the overage and names the sheet that carries it', () => {
    const failure = cssBudgetFailure([
      sheet('main.css', CSS_BUDGET_GZIP + 2048),
      sheet('blog.css', CSS_BUDGET_GZIP - 1),
    ])

    expect(failure).toContain('main.css')
    expect(failure).not.toContain('blog.css')
    expect(failure).toContain('2.0 KB')
  })
})

describe('heaviestStylesheet', () => {
  it('returns null when nothing was emitted', () => {
    expect(heaviestStylesheet([])).toBeNull()
  })

  it('keeps the first of two sheets of equal weight', () => {
    const first = { file: 'a.css', gzip: 100 }

    expect(heaviestStylesheet([first, { file: 'b.css', gzip: 100 }])).toBe(first)
  })
})
