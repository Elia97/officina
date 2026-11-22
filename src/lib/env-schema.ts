import { Node, type ObjectLiteralElementLike, type ObjectLiteralExpression, Project } from 'ts-morph'

export interface EnvField {
  key: string
  type: string
  context: string
  access: string
  constrained: boolean
}

export interface Unreadable {
  entry: string
  reason: string
}

export interface EnvSchema {
  fields: EnvField[]
  unreadable: Unreadable[]
}

const ENV_FIELD = /^envField\.(\w+)$/

const SPREAD = 'uno spread, le cui chiavi stanno in un altro punto del codice'
const NOT_A_FIELD = 'il valore non è una chiamata `envField`'
const COMPUTED = 'la chiave è calcolata, non scritta'
const NOT_LITERAL = '`context` e `access` non sono scritti per esteso, come stringhe'
const NOT_AN_OBJECT = 'non è un oggetto scritto lì'

// Le validazioni che la guida di Astro elenca per envField.string, oltre al tipo.
const CONSTRAINTS: readonly string[] = ['max', 'min', 'length', 'url', 'includes', 'startsWith', 'endsWith']

const constrained = (options: Node | undefined): boolean =>
  Node.isObjectLiteralExpression(options) && CONSTRAINTS.some((name) => options.getProperty(name) !== undefined)

function literal(options: Node | undefined, name: string): string | undefined {
  if (!Node.isObjectLiteralExpression(options)) return undefined
  const property = options.getProperty(name)
  const value = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined
  return Node.isStringLiteral(value) ? value.getLiteralValue() : undefined
}

const EMPTY: EnvSchema = { fields: [], unreadable: [] }

const unreadable = (entry: string, reason: string): EnvSchema => ({ fields: [], unreadable: [{ entry, reason }] })

const merge = (parts: readonly EnvSchema[]): EnvSchema => ({
  fields: parts.flatMap(({ fields }) => fields),
  unreadable: parts.flatMap((part) => part.unreadable),
})

function member(node: ObjectLiteralElementLike): EnvSchema {
  if (Node.isSpreadAssignment(node)) return unreadable(node.getText(), SPREAD)
  if (!Node.isPropertyAssignment(node)) return unreadable(node.getName(), NOT_A_FIELD)
  const name = node.getNameNode()
  if (Node.isComputedPropertyName(name)) return unreadable(name.getText(), COMPUTED)
  const key = Node.isStringLiteral(name) ? name.getLiteralValue() : name.getText()
  const call = node.getInitializer()
  const type = Node.isCallExpression(call) ? ENV_FIELD.exec(call.getExpression().getText())?.[1] : undefined
  if (!Node.isCallExpression(call) || type === undefined) return unreadable(key, NOT_A_FIELD)
  const [options] = call.getArguments()
  const context = literal(options, 'context')
  const access = literal(options, 'access')
  if (context === undefined || access === undefined) return unreadable(key, NOT_LITERAL)
  return { fields: [{ key, type, context, access, constrained: constrained(options) }], unreadable: [] }
}

function objectOf(node: ObjectLiteralElementLike): ObjectLiteralExpression | undefined {
  const value = Node.isPropertyAssignment(node) ? node.getInitializer() : undefined
  return Node.isObjectLiteralExpression(value) ? value : undefined
}

function schemaOf(env: ObjectLiteralElementLike): EnvSchema {
  const options = objectOf(env)
  if (options === undefined) return unreadable('env', NOT_AN_OBJECT)
  const schema = options.getProperty('schema')
  if (schema === undefined) return EMPTY
  const members = objectOf(schema)
  if (members === undefined) return unreadable('schema', NOT_AN_OBJECT)
  return merge(members.getProperties().map(member))
}

const isEnv = (node: Node): node is ObjectLiteralElementLike =>
  (Node.isPropertyAssignment(node) || Node.isShorthandPropertyAssignment(node)) && node.getName() === 'env'

// Il sorgente si legge invece di importarlo: astro.config.mjs importa moduli senza estensione, che
// risolve Vite e che Node rifiuta con ERR_MODULE_NOT_FOUND.
export function envSchema(source: string): EnvSchema {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('astro.config.mjs', source)
  return merge(file.getDescendants().filter(isEnv).map(schemaOf))
}
