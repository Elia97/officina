import { describe, expect, it } from 'vitest'

import { isValidIdentifier } from './identifier.mjs'

describe('isValidIdentifier', () => {
  it.each(['hero', 'blogPost', '_private', '$dollar', 'a1', 'Await'])('accepts %s', (name) => {
    expect(isValidIdentifier(name)).toBe(true)
  })

  // camelCase('new feature') dà `new`: una parola riservata raggiungibile da un nome di sezione ordinario.
  it.each(['new', 'class', 'return', 'typeof', 'enum', 'await'])('rejects the reserved word %s', (name) => {
    expect(isValidIdentifier(name)).toBe(false)
  })

  it.each([
    ['', 'empty'],
    ['2fa', 'leading digit'],
    ['my-section', 'a dash'],
    ['città', 'non-ASCII letters'],
    ['a b', 'a space'],
  ])('rejects %s (%s)', (name) => {
    expect(isValidIdentifier(name)).toBe(false)
  })
})
