export function isNameTaken(sourceFile, name) {
  if (sourceFile.getVariableDeclaration(name) || sourceFile.getFunction(name)) return true
  return sourceFile
    .getImportDeclarations()
    .some(
      (d) =>
        d.getNamedImports().some((n) => (n.getAliasNode()?.getText() ?? n.getName()) === name) ||
        d.getDefaultImport()?.getText() === name,
    )
}
