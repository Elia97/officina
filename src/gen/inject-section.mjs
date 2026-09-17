// L'inserimento va SOPRA ogni marcatore: sotto, l'organizeImports di Biome adotta il marcatore come
// trivia iniziale del nuovo import e lo sposta nel blocco ordinato. (.astro non è leggibile da ts-morph.)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { Node, Project, SyntaxKind } from 'ts-morph'

import { failing } from './hook-points.mjs'
import { findSectionedPages, sectionFiles, sectionTargets } from './section-targets.mjs'
import { isNameTaken } from './ts-morph-utils.mjs'

const GUIDE = 'docs/guides/content-collections.md'

const fail = failing('gen:section injection failed', GUIDE)

function addSource(project, root, path, missing) {
  if (!existsSync(`${root}/${path}`)) fail(path, missing)
  return project.addSourceFileAtPath(`${root}/${path}`)
}

function locateUnionArray(project, root, targets, collection) {
  const created = 'a sectioned collection is created by `pnpm gen:collection`'
  const barrel = addSource(
    project,
    root,
    targets.barrel,
    `the "${collection}" collection has no schema barrel — ${created}`,
  )
  const fn = barrel.getFunction(targets.schemaFunction)
  if (!fn) {
    fail(targets.barrel, `no \`${targets.schemaFunction}\` function — was it renamed?`)
  }
  const call = fn
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .find((c) => c.getExpression().getText() === 'z.discriminatedUnion')
  if (!call) {
    fail(targets.barrel, `no \`z.discriminatedUnion(…)\` call inside ${targets.schemaFunction}`)
  }
  const union = call.getArguments()[1]?.asKind(SyntaxKind.ArrayLiteralExpression)
  if (!union) {
    fail(targets.barrel, 'the second argument of z.discriminatedUnion is not an array literal')
  }
  return { barrel, fn, union }
}

const inUnion = (union, camel) =>
  union.getElements().some((element) => element.getText().startsWith(`${camel}SectionSchema(`))

function locateReturnObject(project, root, targets, collection) {
  const created = 'a sectioned collection is created by `pnpm gen:collection`'
  const layer = addSource(
    project,
    root,
    targets.dataLayer,
    `the "${collection}" collection has no data layer — ${created}`,
  )
  const fn = layer.getFunction(targets.dataFunction)
  if (!fn) {
    fail(targets.dataLayer, `no \`${targets.dataFunction}\` function — was it renamed?`)
  }
  const ret = fn
    .getBody()
    ?.getStatements()
    .findLast((s) => s.isKind(SyntaxKind.ReturnStatement))
  const obj = ret?.getExpression()?.asKind(SyntaxKind.ObjectLiteralExpression)
  if (!obj) {
    fail(
      targets.dataLayer,
      `${targets.dataFunction} has no top-level \`return { … }\` object literal to register the pick() in`,
    )
  }
  return obj
}

function readSectionedPage(root, targets) {
  const pages = findSectionedPages(root, targets.sectionsMarker)
  if (pages.length === 0) {
    fail('src/pages/', `no page carries the \`${targets.sectionsMarker}\` marker — the component has no anchor`)
  }
  if (pages.length > 1) {
    fail(
      'src/pages/',
      `${pages.join(' and ')} all carry the \`${targets.sectionsMarker}\` marker — keep it on one page`,
    )
  }
  const [page] = pages
  const src = readFileSync(`${root}/${page}`, 'utf8')
  if (!src.includes(targets.importsMarker)) {
    fail(page, `the \`${targets.importsMarker}\` marker is missing — the import has no anchor`)
  }
  return { page, src }
}

function assertContextForwardable(fn, targets) {
  const [first] = fn.getParameters()
  if (first && !Node.isIdentifier(first.getNameNode())) {
    fail(
      targets.barrel,
      `${targets.schemaFunction} destructures its parameter — name it \`context: SchemaContext\`, so an image section can receive it`,
    )
  }
}

// Gli ancoraggi di una collection a sezioni, senza sapere che sezione stia per nascere: il pre-volo
// ci aggiunge i controlli sul nome nuovo, `doctor` li guarda e basta.
export function assertSectionAnchors({ root, collection, project = new Project() }) {
  const targets = sectionTargets(collection)
  const { barrel, fn, union } = locateUnionArray(project, root, targets, collection.kebab)
  assertContextForwardable(fn, targets)
  const obj = locateReturnObject(project, root, targets, collection.kebab)
  const { page, src } = readSectionedPage(root, targets)
  return { targets, barrel, fn, union, obj, page, src }
}

export function assertSectionInjectable({ root, collection, camel, kebab, pascal }) {
  const { targets, barrel, union, obj, page, src } = assertSectionAnchors({ root, collection })
  if (inUnion(union, camel)) {
    fail(targets.barrel, `section "${camel}" is already in the union — pick another name`)
  }
  if (isNameTaken(barrel, `${camel}SectionSchema`)) {
    fail(
      targets.barrel,
      `the identifier \`${camel}SectionSchema\` is already taken — the injected import would collide. Pick another name`,
    )
  }
  if (obj.getProperty(camel)) {
    fail(targets.dataLayer, `section "${camel}" is already picked in ${targets.dataFunction}`)
  }
  const frontmatter = src.split('---')[1] ?? ''
  if (new RegExp(`\\b${pascal}\\b`).test(frontmatter)) {
    fail(
      page,
      `the identifier \`${pascal}\` is already used in the frontmatter — the component import would collide. Pick another name`,
    )
  }
  for (const target of sectionFiles(targets, kebab)) {
    if (existsSync(`${root}/${target}`)) {
      fail(target, 'the file already exists — remove it first or pick another name')
    }
  }
}

function contextArgument(barrel, fn) {
  const [first] = fn.getParameters()
  if (first) return first.getName()
  fn.addParameter({ name: 'context', type: 'SchemaContext' })
  if (!isNameTaken(barrel, 'SchemaContext')) {
    barrel.addImportDeclaration({ moduleSpecifier: 'astro:content', namedImports: ['SchemaContext'], isTypeOnly: true })
  }
  return 'context'
}

export function injectSection({ root, collection, camel, kebab, pascal, image = false }) {
  const project = new Project()
  const { targets, barrel, fn, union, obj, page, src: original } = assertSectionAnchors({ root, collection, project })

  if (!barrel.getImportDeclaration((d) => d.getModuleSpecifierValue() === `./${kebab}`)) {
    barrel.addImportDeclaration({
      moduleSpecifier: `./${kebab}`,
      namedImports: [`${camel}SectionSchema`],
    })
  }
  if (!inUnion(union, camel)) {
    union.addElement(`${camel}SectionSchema(${image ? contextArgument(barrel, fn) : ''})`)
  }
  if (!obj.getProperty(camel)) {
    obj.addPropertyAssignment({ name: camel, initializer: `pick('${camel}')` })
  }

  project.saveSync()

  let src = original
  const imp = `import ${pascal} from '@/components/${collection.kebab}/${kebab}.astro'`
  if (!src.includes(imp)) {
    src = src.replace(targets.importsMarker, `${imp}\n${targets.importsMarker}`)
  }
  const use = `<${pascal} {...content.${camel}} />`
  if (!src.includes(use)) {
    src = src.replace(targets.sectionsMarker, `${use}\n  ${targets.sectionsMarker}`)
  }
  writeFileSync(`${root}/${page}`, src)
}
