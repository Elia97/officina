import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { assertStringsInjectable, injectStrings } from './inject-strings.mjs'
import { postGenAction } from './post-gen.mjs'

const ROLLBACK_HINT =
  'gen:page also MODIFIED every dictionary in src/i18n/strings/. Review them with `git diff`, then discard ONLY ' +
  'the injected page.* keys with `git checkout -p` on those paths, and delete the generated page. A re-run ' +
  'without rollback fails pre-flight with "is already there".'

export function pathSegments(plop, value) {
  const dash = plop.getHelper('dashCase')
  return String(value)
    .split('/')
    .map((segment) => dash(segment.trim()))
    .filter(Boolean)
}

export function pageStrings({ pageKey, pageTitle, dynamic }) {
  const title = { key: `page.${pageKey}.title`, value: pageTitle }
  return dynamic ? [title] : [title, { key: `page.${pageKey}.description`, value: '<PAGE_DESCRIPTION>' }]
}

export default function pageGenerator(plop) {
  const root = process.cwd()
  const tpl = 'templates/page'
  plop.setGenerator('page', {
    description: 'New Astro page (static, or dynamic [slug] with getStaticPaths)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Page path (e.g. about-us, or nested like legal/privacy):',
        // change-case toglie la punteggiatura, quindi '...' non è vuoto ma in dash-case diventa ''.
        validate: (value) =>
          pathSegments(plop, value).length > 0 || 'Page path must contain at least one letter or digit',
      },
      {
        type: 'confirm',
        name: 'dynamic',
        message: 'Dynamic [slug] route with getStaticPaths?',
        default: false,
      },
    ],
    actions: (answers) => {
      const segments = pathSegments(plop, answers.name)
      const pagePath = segments.join('/')
      answers.pagePath = pagePath
      answers.pageTitle = plop.getHelper('sentenceCase')(segments.at(-1))
      answers.pageKey = plop.getHelper('camelCase')(pagePath)
      const target = answers.dynamic ? `src/pages/${pagePath}/[slug].astro` : `src/pages/${pagePath}.astro`
      const strings = pageStrings(answers)
      return [
        () => {
          if (existsSync(join(root, target))) {
            throw new Error(`gen:page pre-flight failed: ${target} already exists — remove it or pick another path`)
          }
          assertStringsInjectable({ root, keys: strings.map(({ key }) => key) })
          return 'page path and dictionary contract checks passed'
        },
        {
          type: 'add',
          path: target,
          templateFile: answers.dynamic ? `${tpl}/dynamic.astro.hbs` : `${tpl}/static.astro.hbs`,
        },
        () => {
          injectStrings({ root, entries: strings })
          return `injected ${strings.map(({ key }) => key).join(', ')}`
        },
        postGenAction(root, ROLLBACK_HINT),
      ]
    },
  })
}
