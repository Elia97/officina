import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { isValidIdentifier } from './identifier.mjs'

export function casings(plop, value) {
  return {
    camel: plop.getHelper('camelCase')(value),
    kebab: plop.getHelper('dashCase')(value),
    pascal: plop.getHelper('pascalCase')(value),
  }
}

export function sectionTargets({ camel, kebab, pascal }) {
  return {
    barrel: `src/lib/schemas/${kebab}/index.ts`,
    schemaFunction: `${camel}CollectionSchema`,
    dataLayer: `src/lib/${kebab}.ts`,
    dataFunction: `get${pascal}Sections`,
    schemaDir: `src/lib/schemas/${kebab}`,
    contentDir: `src/content/${kebab}`,
    componentDir: `src/components/${kebab}`,
    importsMarker: `// @gen:${kebab}-imports`,
    sectionsMarker: `{/* @gen:${kebab}-sections */}`,
  }
}

export const sectionFiles = (targets, kebab) => [
  `${targets.schemaDir}/${kebab}.ts`,
  `${targets.contentDir}/${kebab}.yml`,
  `${targets.componentDir}/${kebab}.astro`,
]

export function findSectionedPages(root, marker) {
  return readdirSync(join(root, 'src/pages'), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.astro'))
    .map((entry) => relative(root, join(entry.parentPath, entry.name)))
    .filter((page) => readFileSync(join(root, page), 'utf8').includes(marker))
    .sort()
}

export function validateSectionName(plop) {
  return (value) => {
    const camel = plop.getHelper('camelCase')(String(value))
    if (!camel) return 'Section name is required'
    if (!isValidIdentifier(camel)) {
      return `"${value}" would generate an invalid identifier (${camel}SectionSchema) — use ASCII letters/digits, starting with a letter, not a JS reserved word`
    }
    return true
  }
}
