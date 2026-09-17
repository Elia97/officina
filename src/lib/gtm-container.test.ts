import { describe, expect, it } from 'vitest'

import type { ContainerResource } from './gtm-container.ts'
import { extractGtmId, extractTriggers, googleTagIds, parseContainerData } from './gtm-container.ts'

const literal = (resource: unknown) => `window.x=1;var data = ${JSON.stringify({ resource })};\n(function(){})()`

const container = (over: Partial<ContainerResource> = {}): ContainerResource => ({
  macros: [],
  tags: [],
  predicates: [],
  rules: [],
  ...over,
})

// Un tag GA4 fatto scattare da una regola, con le tre forme di condizione che il lettore conosce.
const sample = container({
  macros: [
    { function: '__e' },
    { function: '__v', vtp_name: 'gtm.element' },
    { function: '__v', vtp_name: 'gtm.triggers' },
  ],
  tags: [{ function: '__gaawe', vtp_eventName: 'newsletter_signup' }],
  predicates: [
    { function: '_eq', arg0: ['macro', 0], arg1: 'gtm.formSubmit' },
    { function: '_css', arg0: ['macro', 1], arg1: 'form[data-form-name="newsletter"]' },
    { function: '_re', arg0: ['macro', 2], arg1: '(^$|((^|,)123_5($|,)))' },
  ],
  rules: [
    [
      ['if', 0, 1, 2],
      ['add', 0],
    ],
  ],
})

describe('parseContainerData', () => {
  it('reads the four resource arrays', () => {
    const parsed = parseContainerData(literal({ macros: [{ function: '__e' }], tags: [], predicates: [], rules: [[]] }))
    expect(parsed.macros).toEqual([{ function: '__e' }])
    expect(parsed.rules).toEqual([[]])
  })

  it('drops entries of the wrong shape instead of trusting them', () => {
    const parsed = parseContainerData(literal({ macros: [1, { function: '__e' }], tags: 'nope', rules: [7, []] }))
    expect(parsed.macros).toEqual([{ function: '__e' }])
    expect(parsed.tags).toEqual([])
    expect(parsed.rules).toEqual([[]])
  })

  it('survives braces and escaped quotes inside string values', () => {
    const selector = 'form[data-x="{a}"]'
    const parsed = parseContainerData(literal({ predicates: [{ function: '_css', arg1: selector }] }))
    expect(parsed.predicates[0]?.arg1).toBe(selector)
  })

  it('throws when the container carries no data literal', () => {
    expect(() => parseContainerData('var other = {};')).toThrow(/no `var data = \{`/)
  })

  it('throws when the literal never closes', () => {
    expect(() => parseContainerData('var data = {"resource":{')).toThrow(/never closes/)
  })

  it('throws when the literal carries no resource', () => {
    expect(() => parseContainerData('var data = {"version":"1"};')).toThrow(/no `resource`/)
  })
})

describe('extractGtmId', () => {
  it('reads the id off the inline config script', () => {
    const html = `<head><script>(function(){const gtmId = "GTM-ABC123";\n window.__rsAnalyticsConfig = { gtmId }})()</script>`
    expect(extractGtmId(html)).toBe('GTM-ABC123')
  })

  it('throws when the markup carries no config at all', () => {
    expect(() => extractGtmId('<head></head>')).toThrow(/no GTM id/)
  })

  it('throws when the config is there but the id is not', () => {
    expect(() => extractGtmId('<script>window.__rsAnalyticsConfig = {}</script>')).toThrow(/no GTM id/)
  })

  it('does not walk past the start of the document looking for a script tag', () => {
    expect(() => extractGtmId('__rsAnalyticsConfig')).toThrow(/no GTM id/)
  })
})

describe('googleTagIds', () => {
  it('collects the configured GA4 properties, once each', () => {
    const tags = [
      { function: '__googtag', vtp_tagId: 'G-AAA' },
      { function: '__googtag', vtp_tagId: 'G-AAA' },
      { function: '__gaawe', vtp_tagId: 'G-BBB' },
      { function: '__googtag' },
    ]
    expect(googleTagIds(container({ tags }))).toEqual(['G-AAA'])
  })

  it('comes back empty when nothing configures a property', () => {
    expect(googleTagIds(container())).toEqual([])
  })
})

describe('extractTriggers', () => {
  it('walks a GA4 tag back to its conditions', () => {
    expect(extractTriggers(sample)).toEqual([
      {
        eventName: 'newsletter_signup',
        firesOn: ['gtm.formSubmit'],
        selectors: ['form[data-form-name="newsletter"]'],
        urlContains: [],
        unsupported: [],
      },
    ])
  })

  it('ignores tags that are not GA4 events', () => {
    expect(extractTriggers(container({ tags: [{ function: '__googtag' }], rules: [[['add', 0]]] }))).toEqual([])
  })

  it('reads a url-contains condition', () => {
    const withUrl = container({
      macros: [{ function: '__v', vtp_name: 'gtm.elementUrl' }],
      tags: [{ function: '__gaawe', vtp_eventName: 'click_to_call' }],
      predicates: [{ function: '_cn', arg0: ['macro', 0], arg1: 'tel:' }],
      rules: [
        [
          ['if', 0],
          ['add', 0],
        ],
      ],
    })
    expect(extractTriggers(withUrl)[0]?.urlContains).toEqual(['tel:'])
  })

  it('names a tag by its index when it declares no event name', () => {
    const unnamed = container({ tags: [{ function: '__gaawe' }], rules: [[['add', 0]]] })
    expect(extractTriggers(unnamed)[0]?.eventName).toBe('tag #0')
  })

  it('emits one trigger per rule that adds the tag', () => {
    const twice = container({
      tags: [{ function: '__gaawe', vtp_eventName: 'x' }],
      rules: [[['add', 0]], [['add', 0]]],
    })
    expect(extractTriggers(twice)).toHaveLength(2)
  })

  it('skips clauses that are not arrays', () => {
    const noisy = container({ tags: [{ function: '__gaawe' }], rules: [['junk', ['add', 0]]] })
    expect(extractTriggers(noisy)).toHaveLength(1)
  })
})
