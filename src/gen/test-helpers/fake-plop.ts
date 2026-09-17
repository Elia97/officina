const words = (value: string): string[] =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word.toLowerCase())

const capitalize = (word: string) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`

const HELPERS: Record<string, (value: string) => string> = {
  camelCase: (value) =>
    words(value)
      .map((word, i) => (i === 0 ? word : capitalize(word)))
      .join(''),
  dashCase: (value) => words(value).join('-'),
  pascalCase: (value) => words(value).map(capitalize).join(''),
  sentenceCase: (value) => {
    const [first, ...rest] = words(value)
    return first ? [capitalize(first), ...rest].join(' ') : ''
  },
}

export type Answers = Record<string, string | boolean | undefined>

export interface AddAction {
  type: string
  path: string
  templateFile: string
  data?: Record<string, unknown>
}

export type FunctionAction = (answers: Answers, config: unknown, api: FakePlop) => string

export type PlopAction = AddAction | FunctionAction

export interface Prompt {
  type: string
  name: string
  message: string
  default?: string | boolean
  when?: (answers: Answers) => boolean
  validate?: (value: unknown) => true | string
}

export interface GeneratorConfig {
  description: string
  prompts: Prompt[]
  actions: PlopAction[] | ((answers: Answers) => PlopAction[])
}

export interface FakePlop {
  setGenerator: (name: string, config: GeneratorConfig) => void
  getHelper: (name: string) => (value: string) => string
  registered: Map<string, GeneratorConfig>
}

function fakePlop(): FakePlop {
  const registered = new Map<string, GeneratorConfig>()
  return {
    setGenerator: (name, config) => {
      registered.set(name, config)
    },
    getHelper: (name) => HELPERS[name] as (value: string) => string,
    registered,
  }
}

export function registerWith(
  define: (plop: FakePlop) => void,
  name: string,
): { plop: FakePlop; config: GeneratorConfig } {
  const plop = fakePlop()
  define(plop)
  const config = plop.registered.get(name)
  if (!config) throw new Error(`no generator registered as "${name}"`)
  return { plop, config }
}

export function actionsFor(config: GeneratorConfig, answers: Answers): PlopAction[] {
  return typeof config.actions === 'function' ? config.actions(answers) : config.actions
}

export const addActions = (actions: PlopAction[]): AddAction[] =>
  actions.filter((action): action is AddAction => typeof action !== 'function')

/** Post-gen, la terza azione, non è mai invocata: lancia `astro sync`. */
export function functionSteps(actions: PlopAction[]): { preflight: FunctionAction; inject: FunctionAction } {
  const [preflight, inject, ...rest] = actions.filter(
    (action): action is FunctionAction => typeof action === 'function',
  )
  if (!preflight || !inject || rest.length !== 1 || actions[0] !== preflight) {
    throw new Error('expected exactly three function actions, the pre-flight first')
  }
  return { preflight, inject }
}

export const runAction = (action: FunctionAction, answers: Answers, plop: FakePlop): string =>
  action(answers, null, plop)

export const promptNamed = (config: GeneratorConfig, name: string): Prompt =>
  config.prompts.find((prompt) => prompt.name === name) as Prompt
