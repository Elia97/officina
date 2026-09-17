import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { assertInjectable, injectCollection } from './inject-config.mjs'
import { assertStringsInjectable, injectStrings } from './inject-strings.mjs'
import { pageStrings, pathSegments } from './page.mjs'
import { postGenAction } from './post-gen.mjs'
import { casings, findSectionedPages, sectionFiles, sectionTargets, validateSectionName } from './section-targets.mjs'

const SECTIONS = 'templates/sections'
const SECTION = 'templates/section'

const ROLLBACK_HINT =
  'gen:collection also MODIFIED src/content.config.ts and every dictionary in src/i18n/strings/. Review them ' +
  'with `git diff`, then discard ONLY the injected hunks with `git checkout -p` on those paths, and delete the ' +
  'generated barrel, data layer, page and section files. A re-run without rollback fails pre-flight with ' +
  '"already exists".'

const forSections = (answers) => answers.sections === true

export function sectionedCollectionPrompts(plop) {
  return [
    {
      type: 'input',
      name: 'page',
      message: 'Page path of the sectioned page (e.g. about-us):',
      when: forSections,
      validate: (value) =>
        pathSegments(plop, value).length > 0 || 'Page path must contain at least one letter or digit',
    },
    {
      type: 'input',
      name: 'section',
      message: 'First section name (e.g. intro):',
      when: forSections,
      validate: validateSectionName(plop),
    },
    {
      type: 'confirm',
      name: 'image',
      message: 'Does the first section carry an image?',
      default: false,
      when: forSections,
    },
  ]
}

function assertCreatable({ root, targets, page, section, strings }) {
  for (const path of [page, targets.barrel, targets.dataLayer, ...sectionFiles(targets, section.kebab)]) {
    if (existsSync(join(root, path))) {
      throw new Error(`gen:collection pre-flight failed: ${path} already exists — remove it or pick another name`)
    }
  }
  const carriers = findSectionedPages(root, targets.sectionsMarker)
  if (carriers.length > 0) {
    throw new Error(
      `gen:collection pre-flight failed: ${carriers.join(', ')} already carries ${targets.sectionsMarker}`,
    )
  }
  assertStringsInjectable({ root, keys: strings.map(({ key }) => key) })
}

export function sectionedCollectionActions(plop, answers, root) {
  const collection = casings(plop, answers.name)
  const section = casings(plop, answers.section)
  const targets = sectionTargets(collection)
  const segments = pathSegments(plop, answers.page)
  const pageKey = plop.getHelper('camelCase')(segments.join('/'))
  const page = `src/pages/${segments.join('/')}.astro`
  const strings = pageStrings({ pageKey, pageTitle: plop.getHelper('sentenceCase')(segments.at(-1)), dynamic: false })
  const data = { collection: answers.name, pageKey }
  const [schema, content, component] = sectionFiles(targets, section.kebab)
  return [
    () => {
      assertInjectable({ root, camel: collection.camel, kebab: collection.kebab })
      assertCreatable({ root, targets, page, section, strings })
      return 'content.config.ts, page and dictionary contract checks passed'
    },
    { type: 'add', path: targets.barrel, templateFile: `${SECTIONS}/index.ts.hbs`, data },
    { type: 'add', path: targets.dataLayer, templateFile: `${SECTIONS}/data-layer.ts.hbs`, data },
    { type: 'add', path: page, templateFile: `${SECTIONS}/page.astro.hbs`, data },
    { type: 'add', path: schema, templateFile: `${SECTION}/schema.ts.hbs`, data },
    { type: 'add', path: content, templateFile: `${SECTION}/content.yml.hbs`, data },
    { type: 'add', path: component, templateFile: `${SECTION}/component.astro.hbs`, data },
    () => {
      injectCollection({ root, camel: collection.camel, kebab: collection.kebab, sections: true })
      injectStrings({ root, entries: strings })
      return `injected sectioned collection ${collection.kebab} and ${strings.map(({ key }) => key).join(', ')}`
    },
    postGenAction(root, ROLLBACK_HINT),
  ]
}
