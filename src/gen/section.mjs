import { isValidIdentifier } from './identifier.mjs'
import { assertSectionInjectable, injectSection } from './inject-section.mjs'
import { postGenAction } from './post-gen.mjs'
import { casings, sectionFiles, sectionTargets, validateSectionName } from './section-targets.mjs'

function rollbackHint(targets) {
  return (
    `gen:section also MODIFIED three existing files: ${targets.barrel}, ${targets.dataLayer} and the page ` +
    `that carries ${targets.sectionsMarker}. Review them with \`git diff\`, then discard ONLY the injected hunks ` +
    'with `git checkout -p` on those paths. Then delete the generated schema/yml/component files. A re-run ' +
    'without rollback fails pre-flight with "already in the union".'
  )
}

export default function sectionGenerator(plop) {
  const root = process.cwd()
  const tpl = 'templates/section'
  plop.setGenerator('section', {
    description: 'New section of a sectioned page (Zod schema + YAML + component + injection)',
    prompts: [
      {
        type: 'input',
        name: 'collection',
        message: 'Sectioned collection (e.g. homepage):',
        default: 'homepage',
        validate: (value) => {
          const camel = plop.getHelper('camelCase')(String(value))
          if (!camel) return 'Collection name is required'
          if (!isValidIdentifier(camel)) {
            return `"${value}" would generate an invalid identifier (${camel}CollectionSchema) — use ASCII letters/digits, starting with a letter, not a JS reserved word`
          }
          return true
        },
      },
      {
        type: 'input',
        name: 'name',
        message: 'Section name (e.g. features):',
        validate: validateSectionName(plop),
      },
      {
        type: 'confirm',
        name: 'image',
        message: 'Does the section carry an image? (its content starts on src/assets/placeholder.jpg)',
        default: false,
      },
    ],
    actions: (answers) => {
      const collection = casings(plop, answers.collection)
      const section = casings(plop, answers.name)
      const targets = sectionTargets(collection)
      const request = { root, collection, ...section, image: answers.image === true }
      const [schema, content, component] = sectionFiles(targets, section.kebab)
      const data = { section: answers.name }
      return [
        () => {
          assertSectionInjectable(request)
          return 'hook-point contract checks passed'
        },
        { type: 'add', path: schema, templateFile: `${tpl}/schema.ts.hbs`, data },
        { type: 'add', path: content, templateFile: `${tpl}/content.yml.hbs`, data },
        { type: 'add', path: component, templateFile: `${tpl}/component.astro.hbs`, data },
        () => {
          injectSection(request)
          return `injected union + pick + page: ${section.pascal}`
        },
        postGenAction(root, rollbackHint(targets)),
      ]
    },
  })
}
