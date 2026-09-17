import { describe, expect, it } from 'vitest'
import componentGenerator from './component.mjs'
import pageGenerator from './page.mjs'
import { actionsFor, addActions, promptNamed, registerWith } from './test-helpers/fake-plop.ts'

const page = () => registerWith(pageGenerator, 'page')
const component = () => registerWith(componentGenerator, 'component')

const validate = (which: 'page' | 'component', prompt: string, value: string) => {
  const { config } = which === 'page' ? page() : component()
  return promptNamed(config, prompt).validate?.(value)
}

describe('gen:page path handling', () => {
  it.each([
    ['about-us', 'about-us.astro'],
    ['legal/privacy', 'legal/privacy.astro'],
    ['  spaced  ', 'spaced.astro'],
  ])('dash-cases each segment of %s independently', (name, expected) => {
    const [add] = addActions(actionsFor(page().config, { name, dynamic: false }))

    expect(add?.path).toBe(`src/pages/${expected}`)
  })

  it('puts a dynamic route in its own folder with the [slug] template', () => {
    const [add] = addActions(actionsFor(page().config, { name: 'blog', dynamic: true }))

    expect(add?.path).toBe('src/pages/blog/[slug].astro')
    expect(add?.templateFile).toContain('dynamic.astro.hbs')
  })

  it('titles the page from its LAST segment, not the whole path', () => {
    const answers = { name: 'legal/cookie-policy', dynamic: false }

    actionsFor(page().config, answers)

    expect(answers).toMatchObject({ pagePath: 'legal/cookie-policy', pageTitle: 'Cookie policy' })
  })

  it.each(['...', '   ', '/'])('rejects %s, which dash-cases to nothing', (value) => {
    expect(validate('page', 'name', value)).toBe('Page path must contain at least one letter or digit')
  })

  it('accepts a real path', () => {
    expect(validate('page', 'name', 'about-us')).toBe(true)
  })
})

describe('gen:component guards', () => {
  it('rejects a name whose camel form is not a valid identifier', () => {
    expect(validate('component', 'name', '404-page')).toMatch(/invalid identifier \(404PageVariants\)/)
  })

  it('rejects an empty name', () => {
    expect(validate('component', 'name', '...')).toBe('Component name is required')
  })

  it('accepts a normal component name', () => {
    expect(validate('component', 'name', 'PriceCard')).toBe(true)
  })

  // `plop component X ''` salta il default del prompt, quindi il percorso di bypass arriva a validate con ''.
  it('rejects an area that dash-cases to nothing', () => {
    expect(validate('component', 'area', '...')).toMatch(/at least one letter or digit/)
  })

  it('accepts a real area folder', () => {
    expect(validate('component', 'area', 'marketing')).toBe(true)
  })

  // I handlebars li espande plop, quindi l'azione porta il template e non il percorso finale.
  it('dash-cases both the area and the name in its path template', () => {
    const [add] = addActions(actionsFor(component().config, { name: 'PriceCard', area: 'Marketing Pages' }))

    expect(add?.path).toBe('src/components/{{dashCase area}}/{{dashCase name}}.astro')
  })
})
