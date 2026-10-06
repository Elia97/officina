import { Node, Project, type PropertyAssignment, SyntaxKind } from 'ts-morph'

export interface EnvField {
  key: string
  type: string
  context: string | undefined
  access: string | undefined
  constrained: boolean
}

const ENV_FIELD = /^envField\.(\w+)$/

// Le validazioni che la guida di Astro elenca per envField.string, oltre al tipo.
const CONSTRAINTS: readonly string[] = ['max', 'min', 'length', 'url', 'includes', 'startsWith', 'endsWith']

const constrained = (options: Node | undefined): boolean =>
  Node.isObjectLiteralExpression(options) && CONSTRAINTS.some((name) => options.getProperty(name) !== undefined)

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
    const type = ENV_FIELD.exec(call.getExpression().getText())?.[1]
    if (type === undefined || !Node.isPropertyAssignment(property)) return []
    const [options] = call.getArguments()
    return [
      {
        key: keyOf(property),
        type,
        context: literal(options, 'context'),
        access: literal(options, 'access'),
        constrained: constrained(options),
      },
    ]
  })
}
