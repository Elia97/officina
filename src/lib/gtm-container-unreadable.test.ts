// Cosa fa il lettore con una condizione che non sa interpretare: riportare un trigger simile
// come compreso trasformerebbe un ignoto in un silenzioso "coperto".
import { describe, expect, it } from 'vitest'

import type { ContainerResource } from './gtm-container.ts'
import { extractTriggers } from './gtm-container.ts'

const EVENT_MACRO = [{ function: '__e' }]

const withPredicate = (predicate: Record<string, unknown>, macros: Record<string, unknown>[]): ContainerResource => ({
  macros,
  tags: [{ function: '__gaawe', vtp_eventName: 'x' }],
  predicates: [predicate],
  rules: [
    [
      ['if', 0],
      ['add', 0],
    ],
  ],
})

const withRule = (rule: unknown[][], predicates: Record<string, unknown>[] = []): ContainerResource => ({
  macros: EVENT_MACRO,
  tags: [{ function: '__gaawe' }],
  predicates,
  rules: rule,
})

const unsupportedOf = (container: ContainerResource): string[] => extractTriggers(container)[0]?.unsupported ?? []

describe('predicates the reader cannot resolve', () => {
  it('flags an index that points nowhere', () => {
    expect(
      unsupportedOf(
        withRule([
          [
            ['if', 9],
            ['add', 0],
          ],
        ]),
      ),
    ).toEqual(['predicate #9 does not exist'])
  })

  it('flags an index that is not an index', () => {
    const container = withRule(
      [
        [
          ['if', 'zero'],
          ['add', 0],
        ],
      ],
      [{ function: '_eq' }],
    )
    expect(unsupportedOf(container)).toEqual(['predicate #zero does not exist'])
  })

  it('flags a variable it cannot name, whatever makes it unnameable', () => {
    const cases = [
      withPredicate({ function: '_eq', arg1: 'x' }, EVENT_MACRO),
      withPredicate({ function: '_eq', arg0: ['var', 0], arg1: 'x' }, EVENT_MACRO),
      withPredicate({ function: '_eq', arg0: ['macro', 'first'], arg1: 'x' }, EVENT_MACRO),
      withPredicate({ function: '_eq', arg0: ['macro', 0], arg1: 'x' }, [{ function: '__v' }]),
    ]
    for (const container of cases) expect(unsupportedOf(container)).toEqual(['_eq on an unreadable variable = "x"'])
  })
})

describe('conditions the reader cannot interpret', () => {
  it('flags an operator it does not know, on a variable it does', () => {
    const container = withPredicate({ function: '_sw', arg0: ['macro', 0], arg1: 'gtm.js' }, EVENT_MACRO)
    expect(unsupportedOf(container)).toEqual(['_sw on event = "gtm.js"'])
  })

  it('flags a condition whose value is not a string', () => {
    const container = withPredicate({ function: '_eq', arg0: ['macro', 0], arg1: 42 }, EVENT_MACRO)
    expect(unsupportedOf(container)).toEqual(['_eq on event = 42'])
  })

  it('says nothing about gtm.triggers — GTM’s own bookkeeping, not a condition on the page', () => {
    const macros = [{ function: '__v', vtp_name: 'gtm.triggers' }]
    const container = withPredicate({ function: '_re', arg0: ['macro', 0], arg1: '(^$)' }, macros)
    expect(unsupportedOf(container)).toEqual([])
  })
})

describe('clauses the reader will not guess at', () => {
  const submit = [{ function: '_eq', arg0: ['macro', 0], arg1: 'gtm.formSubmit' }]

  it('declares an `unless` clause unreadable rather than reading it as a requirement', () => {
    expect(
      unsupportedOf(
        withRule(
          [
            [
              ['unless', 0],
              ['add', 0],
            ],
          ],
          submit,
        ),
      ),
    ).toEqual(['`unless` clause'])
  })

  it('flags a tag some rule blocks, and reads the rest of the rule anyway', () => {
    const [trigger] = extractTriggers(
      withRule(
        [
          [
            ['if', 0],
            ['add', 0],
          ],
          [['block', 0]],
        ],
        submit,
      ),
    )
    expect(trigger?.unsupported).toEqual(['a `block` rule targets this tag'])
    expect(trigger?.firesOn).toEqual(['gtm.formSubmit'])
  })
})
