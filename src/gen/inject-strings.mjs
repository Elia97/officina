import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Project, SyntaxKind } from 'ts-morph'

const DICTIONARIES = 'src/i18n/strings'
const GUIDE = 'docs/guides/content-collections.md'

function fail(where, problem) {
  throw new Error(`gen:page injection failed in ${where}: ${problem} (contract: ${GUIDE})`)
}

function locateObject(file, path, locale) {
  const declaration = file.getVariableDeclaration(locale)
  if (!declaration) {
    fail(path, `no \`${locale}\` constant — the dictionary must export \`const ${locale} = { … } as const\``)
  }
  if (!declaration.isExported()) {
    fail(path, `\`${locale}\` is not exported, so src/i18n/ui.ts cannot register it`)
  }
  const object = declaration
    .getInitializerIfKind(SyntaxKind.AsExpression)
    ?.getExpression()
    .asKind(SyntaxKind.ObjectLiteralExpression)
  if (!object) {
    fail(path, `\`${locale}\` is not an object literal with \`as const\`, so there is no place for the new keys`)
  }
  return object
}

function loadDictionaries(root) {
  const names = readdirSync(join(root, DICTIONARIES))
    .filter((name) => name.endsWith('.ts'))
    .sort()
  if (names.length === 0) fail(DICTIONARIES, 'no dictionary to register the page strings in')
  const project = new Project()
  const dictionaries = names.map((name) => {
    const path = `${DICTIONARIES}/${name}`
    const file = project.addSourceFileAtPath(join(root, path))
    return { path, object: locateObject(file, path, name.slice(0, -3)) }
  })
  return { project, dictionaries }
}

export function assertStringsInjectable({ root, keys }) {
  for (const { path, object } of loadDictionaries(root).dictionaries) {
    for (const key of keys) {
      if (object.getProperty(`'${key}'`)) fail(path, `the key '${key}' is already there — pick another page path`)
    }
  }
}

export function injectStrings({ root, entries }) {
  const { project, dictionaries } = loadDictionaries(root)
  for (const { object } of dictionaries) {
    for (const { key, value } of entries) {
      object.addPropertyAssignment({ name: `'${key}'`, initializer: `'${value}'` })
    }
  }
  project.saveSync()
}
