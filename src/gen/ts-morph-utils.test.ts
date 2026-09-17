import { Project } from 'ts-morph'
import { describe, expect, it } from 'vitest'

import { isNameTaken } from './ts-morph-utils.mjs'

const sourceFile = (code: string) => new Project({ useInMemoryFileSystem: true }).createSourceFile('t.ts', code)

describe('isNameTaken', () => {
  it.each([
    ['a variable', 'const posts = 1'],
    ['a function', 'function posts() {}'],
    ['a named import', "import { posts } from './x'"],
    ['an import alias', "import { articles as posts } from './x'"],
    ['a default import', "import posts from './x'"],
  ])('sees %s', (_case, code) => {
    expect(isNameTaken(sourceFile(code), 'posts')).toBe(true)
  })

  it('leaves a free name free', () => {
    expect(isNameTaken(sourceFile("import { other } from './x'\nconst another = 1"), 'posts')).toBe(false)
  })

  it('does not count the original name of an aliased import as taken', () => {
    expect(isNameTaken(sourceFile("import { posts as renamed } from './x'"), 'posts')).toBe(false)
  })
})
