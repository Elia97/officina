import { Node, Project, type PropertyAssignment, SyntaxKind } from 'ts-morph'

export interface EnvField {
  key: string
  context: string | undefined
  access: string | undefined
}

const ENV_FIELD = /^envField\.\w+$/

const keyOf = (property: PropertyAssignment): string => {
  const name = property.getNameNode()
  return Node.isStringLiteral(name) ? name.getLiteralValue() : name.getText()
}

function literal(options: Node | undefined, name: string): string | undefined {
  if (!Node.isObjectLiteralExpression(options)) return undefined
  const property = options.getProperty(name)
  const value = Node.isPropertyAssignment(property) ? property.getInitializer() : undefined
  return Node.isStringLiteral(value) ? value.getLiteralValue() : undefined
}

// Il sorgente si legge invece di importarlo: astro.config.mjs importa moduli senza estensione, che
// risolve Vite e che Node rifiuta con ERR_MODULE_NOT_FOUND.
export function envSchema(source: string): EnvField[] {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile('astro.config.mjs', source)
  return file.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const property = call.getParent()
    if (!(ENV_FIELD.test(call.getExpression().getText()) && Node.isPropertyAssignment(property))) return []
    const [options] = call.getArguments()
    return [{ key: keyOf(property), context: literal(options, 'context'), access: literal(options, 'access') }]
  })
}
