import { isValidIdentifier } from './identifier.mjs'
import { assertInjectable, injectCollection } from './inject-config.mjs'
import { postGenAction } from './post-gen.mjs'
import { sectionedCollectionActions, sectionedCollectionPrompts } from './sectioned-collection.mjs'

function flatCollectionActions(root, answers) {
  const tpl = 'templates/collection'
  return [
    (a, _config, api) => {
      assertInjectable({
        root,
        camel: api.getHelper('camelCase')(a.name),
        kebab: api.getHelper('dashCase')(a.name),
      })
      return 'content.config.ts contract checks passed'
    },
    {
      type: 'add',
      path: 'src/lib/schemas/{{dashCase name}}.ts',
      templateFile: `${tpl}/schema.ts.hbs`,
    },
    {
      type: 'add',
      path: answers.document ? 'src/content/{{dashCase name}}/example.md' : 'src/content/{{dashCase name}}/example.yml',
      templateFile: answers.document ? `${tpl}/doc.md.hbs` : `${tpl}/data.yml.hbs`,
    },
    (a, _config, api) => {
      injectCollection({
        root,
        camel: api.getHelper('camelCase')(a.name),
        kebab: api.getHelper('dashCase')(a.name),
        document: a.document,
      })
      return `injected collection in content.config.ts: ${a.name}`
    },
    postGenAction(root),
  ]
}

export default function collectionGenerator(plop) {
  const root = process.cwd()
  plop.setGenerator('collection', {
    description: 'New content collection (YAML data, MD documents, or a page built from sections)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Collection name (e.g. services, blog):',
        validate: (value) => {
          const camel = plop.getHelper('camelCase')(String(value))
          if (!camel) return 'Collection name is required'
          if (!isValidIdentifier(camel)) {
            return `"${value}" would generate an invalid identifier (const ${camel}) — use ASCII letters/digits, starting with a letter, not a JS reserved word`
          }
          return true
        },
      },
      {
        type: 'confirm',
        name: 'sections',
        message: 'A page built from sections, like the homepage?',
        default: false,
      },
      {
        type: 'confirm',
        name: 'document',
        message: 'MD documents with a renderable body? (No = YAML data)',
        default: false,
        when: (answers) => answers.sections !== true,
      },
      ...sectionedCollectionPrompts(plop),
    ],
    actions: (answers) =>
      answers.sections === true
        ? sectionedCollectionActions(plop, answers, root)
        : flatCollectionActions(root, answers),
  })
}
