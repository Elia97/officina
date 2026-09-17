import { postGenAction } from './post-gen.mjs'

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/

export default function componentGenerator(plop) {
  const root = process.cwd()
  const tpl = 'templates/component'
  plop.setGenerator('component', {
    description: 'New native Astro component (cva + cn recipe)',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Component name (e.g. PriceCard):',
        validate: (value) => {
          const camel = plop.getHelper('camelCase')(String(value))
          if (!camel) return 'Component name is required'
          if (!IDENTIFIER.test(camel)) {
            return `"${value}" would generate an invalid identifier (${camel}Variants) — use ASCII letters/digits, starting with a letter`
          }
          return true
        },
      },
      {
        type: 'input',
        name: 'area',
        message: 'Folder under src/components/ (e.g. ui, marketing):',
        default: 'ui',
        validate: (value) =>
          plop.getHelper('dashCase')(String(value)) !== '' ||
          'Area folder must contain at least one letter or digit (e.g. ui)',
      },
    ],
    actions: [
      {
        type: 'add',
        path: 'src/components/{{dashCase area}}/{{dashCase name}}.astro',
        templateFile: `${tpl}/component.astro.hbs`,
      },
      postGenAction(root),
    ],
  })
}
