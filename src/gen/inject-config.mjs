import { Project, SyntaxKind } from 'ts-morph'

import { isNameTaken } from './ts-morph-utils.mjs'

const CONFIG_PATH = 'src/content.config.ts'

function loadConfig(root) {
  const project = new Project()
  return project.addSourceFileAtPath(`${root}/${CONFIG_PATH}`)
}

function locateContract(cfg, { camel, kebab }) {
  const statement = cfg.getVariableStatement((s) => s.getDeclarations().some((d) => d.getName() === 'collections'))
  if (!statement) {
    throw new Error(
      `gen:collection injection failed: no \`collections\` variable in ${CONFIG_PATH}. ` +
        `The contract expects \`export const collections = { … }\` — if it was renamed, ` +
        `restore it or update scripts/gen/inject-config.mjs (see docs/guides/content-collections.md).`,
    )
  }
  if (!statement.hasExportKeyword()) {
    throw new Error(
      `gen:collection injection failed: \`collections\` in ${CONFIG_PATH} is not exported. ` +
        `Astro silently ignores a non-exported collections object — restore \`export const collections\`.`,
    )
  }
  const object = cfg
    .getVariableDeclarationOrThrow('collections')
    .getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
  if (!object) {
    throw new Error(
      `gen:collection injection failed: \`collections\` in ${CONFIG_PATH} is not initialized ` +
        `with an object literal, so there is no place to register the new collection.`,
    )
  }
  if (object.getProperty(camel) || object.getProperty(`'${kebab}'`)) {
    throw new Error(
      `gen:collection injection failed: a collection named "${kebab}" is already registered ` +
        `in ${CONFIG_PATH}. Pick another name, or remove the existing entry first.`,
    )
  }
  if (isNameTaken(cfg, camel)) {
    throw new Error(
      `gen:collection injection failed: the identifier \`${camel}\` is already taken in ` +
        `${CONFIG_PATH} (import or variable) — the injected const would shadow it. Pick another name.`,
    )
  }
  return { statement, object }
}

export function assertInjectable({ root, camel, kebab }) {
  locateContract(loadConfig(root), { camel, kebab })
}

export function injectCollection({ root, camel, kebab, document, sections = false }) {
  const cfg = loadConfig(root)
  const { statement, object } = locateContract(cfg, { camel, kebab })
  const schema = sections ? `${camel}CollectionSchema` : `${camel}Schema`

  if (!cfg.getImportDeclaration((d) => d.getModuleSpecifierValue() === `@/lib/schemas/${kebab}`)) {
    cfg.addImportDeclaration({
      moduleSpecifier: `@/lib/schemas/${kebab}`,
      namedImports: [schema],
    })
  }

  const pattern = document ? '**/*.md' : '**/*.{yaml,yml}'
  const loaderId = document
    ? `    // Default generateId on purpose: this id becomes the route slug, so it\n` +
      `    // should slugify segments and honor a frontmatter \`slug\`.\n`
    : `    // Raw relative path minus extension, like the homepage collection: the\n` +
      `    // default generateId slugifies segments (en-US → en-us), honors a top-level\n` +
      `    // \`slug\` key before zod strips it, and drops a trailing /index — all three\n` +
      `    // break reading entries back by locale folder.\n` +
      `    generateId: ({ entry }) => entry.replace(/\\.(yaml|yml)$/, ''),\n`
  cfg.insertStatements(
    statement.getChildIndex(),
    `const ${camel} = defineCollection({\n` +
      `  loader: glob({\n` +
      `    pattern: '${pattern}',\n` +
      `    base: './src/content/${kebab}',\n` +
      loaderId +
      `  }),\n` +
      `  schema: ${schema},\n` +
      `})\n`,
  )

  if (kebab.includes('-')) {
    object.addPropertyAssignment({ name: `'${kebab}'`, initializer: camel })
  } else {
    object.addShorthandPropertyAssignment({ name: camel })
  }

  cfg.saveSync()
}
