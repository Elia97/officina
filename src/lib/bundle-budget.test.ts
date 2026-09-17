import { describe, expect, it } from 'vitest'

import { budgetFor, deferredClosure, htmlEntries, parseEdges, staticClosure } from './bundle-budget.ts'

const graph = (edges: Record<string, { static?: string[]; dynamic?: string[] }>) =>
  new Map(
    Object.entries(edges).map(([name, { static: statics, dynamic }]) => [
      name,
      { gzip: 0, static: new Set(statics ?? []), dynamic: new Set(dynamic ?? []) },
    ]),
  )

describe('parseEdges', () => {
  it('reads both quoting forms', () => {
    const edges = parseEdges('import "./a.js";import{x}from`./b.js`;await import("./c.js");import(`./d.js`)')
    expect([...edges.static].sort()).toEqual(['a.js', 'b.js'])
    expect([...edges.dynamic].sort()).toEqual(['c.js', 'd.js'])
  })

  it('does not count a dynamic import as a static edge', () => {
    expect([...parseEdges('await import("./heavy.abc.js")').static]).toEqual([])
  })
})

describe('htmlEntries', () => {
  it('takes the page chunks off src and href, and nothing else', () => {
    const html = '<script src="/_astro/page.js"></script><link href="/_astro/main.js"><link href="/_astro/x.css">'
    expect(htmlEntries(html).sort()).toEqual(['main.js', 'page.js'])
  })
})

describe('staticClosure', () => {
  it('follows static edges transitively and stops at dynamic ones', () => {
    const chunks = graph({ 'a.js': { static: ['b.js'], dynamic: ['z.js'] }, 'b.js': { static: ['c.js'] }, 'c.js': {} })
    expect([...staticClosure(['a.js'], chunks).reached].sort()).toEqual(['a.js', 'b.js', 'c.js'])
  })

  it('tiene da parte gli archi verso chunk che non sono stati emessi, invece di saltarli', () => {
    const closure = staticClosure(['a.js'], graph({ 'a.js': { static: ['gone.js'] } }))

    expect([...closure.reached]).toEqual(['a.js'])
    expect([...closure.unknown]).toEqual(['gone.js'])
  })

  it("segnala anche un nome citato dall'HTML che fra i chunk non c'è", () => {
    const closure = staticClosure(['assente.js'], graph({}))

    expect([...closure.reached]).toEqual([])
    expect([...closure.unknown]).toEqual(['assente.js'])
  })

  it('su una pagina senza JavaScript non trova niente e non segnala niente', () => {
    const closure = staticClosure([], graph({}))

    expect([...closure.reached]).toEqual([])
    expect([...closure.unknown]).toEqual([])
  })

  it('terminates on a cycle', () => {
    const chunks = graph({ 'a.js': { static: ['b.js'] }, 'b.js': { static: ['a.js'] } })
    expect([...staticClosure(['a.js'], chunks).reached].sort()).toEqual(['a.js', 'b.js'])
  })
})

describe('deferredClosure', () => {
  it('returns what only an `await import()` reaches, with its own static tail', () => {
    const chunks = graph({ 'a.js': { dynamic: ['heavy.js'] }, 'heavy.js': { static: ['maths.js'] }, 'maths.js': {} })
    const deferred = deferredClosure(staticClosure(['a.js'], chunks).reached, chunks)
    expect([...deferred].sort()).toEqual(['heavy.js', 'maths.js'])
  })

  it('excludes anything the static closure already reached', () => {
    const chunks = graph({ 'a.js': { static: ['b.js'], dynamic: ['b.js'] }, 'b.js': {} })
    expect([...deferredClosure(staticClosure(['a.js'], chunks).reached, chunks)]).toEqual([])
  })
})

describe('budgetFor', () => {
  it('falls back to the default budget for any route', () => {
    expect(budgetFor('/anything').label).toBe('default')
    expect(budgetFor('/').maxGzip).toBe(20 * 1024)
  })
})

describe('budget selection and edges', () => {
  it('lands on the default class for a route no other class matches', () => {
    expect(budgetFor('/nothing-matches-this').label).toBe('default')
  })

  it('ignores a regex match whose capture group is absent', () => {
    expect(parseEdges("import 'sideeffect'\n").static.size).toBe(0)
  })

  it('treats an unknown chunk as having no dynamic edges', () => {
    const chunks = new Map([['a.js', { gzip: 1, static: new Set<string>(), dynamic: new Set(['ghost.js']) }]])
    expect(deferredClosure(new Set(['a.js']), chunks).has('ghost.js')).toBe(false)
  })
})
