import type { Manifest, ProjectFiles } from './alignment.ts'
import { DEPENDENCY_FEATURES, type DependencyFeature } from './config.ts'
import type { ContractGap } from './contract.ts'
import { type EnvField, envSchema } from './env-schema.ts'
import { type ActionInputs, actionInputGaps } from './workflows.ts'

const MANIFEST = 'package.json'
const DRIZZLE_CONFIG = 'drizzle.config.ts'
const ASTRO_CONFIG = 'astro.config.mjs'

const SCRIPTS: readonly { name: string; reason: string }[] = [
  { name: 'db:generate', reason: 'le migrazioni si generano dallo schema con quel nome' },
  { name: 'db:migrate', reason: 'le migrazioni si applicano con quel nome, in CI e al deploy' },
]

const CI_INPUTS: ActionInputs = {
  workflow: '.github/workflows/ci.yml',
  action: 'ci',
  inputs: [
    { name: 'migrate', reason: 'il branch di test non si migra prima dei test' },
    { name: 'database-url', reason: 'i test di integrazione si saltano' },
  ],
}

const DEPLOY_INPUTS: ActionInputs = {
  workflow: '.github/workflows/deploy.yml',
  action: 'deploy',
  inputs: [{ name: 'migrate', reason: 'la produzione parte con lo schema di prima' }],
}

function databaseGaps(files: ProjectFiles, { scripts = {} }: Manifest): ContractGap[] {
  const gaps: ContractGap[] = SCRIPTS.filter(({ name }) => scripts[name] === undefined).map(({ name, reason }) => ({
    path: MANIFEST,
    message: `script \`${name}\` assente: ${reason}`,
  }))
  if (files.read(DRIZZLE_CONFIG) === undefined) {
    gaps.push({ path: DRIZZLE_CONFIG, message: 'manca: drizzle-kit legge da lì la sua configurazione' })
  }
  return [...gaps, ...actionInputGaps(files, CI_INPUTS), ...actionInputGaps(files, DEPLOY_INPUTS)]
}

function secretGap(key: string, field: EnvField | undefined): string | undefined {
  if (field === undefined) {
    return `\`${key}\` non è in \`env.schema\`: va dichiarata con \`context: 'server'\` e \`access: 'secret'\``
  }
  if (field.context === 'server' && field.access === 'secret') return undefined
  return `\`${key}\` in \`env.schema\` non è \`context: 'server'\` con \`access: 'secret'\`: una variabile pubblica Astro la scrive nel codice della build`
}

function secretGaps(source: string | undefined, keys: readonly string[]): ContractGap[] {
  if (keys.length === 0) return []
  if (source === undefined)
    return [{ path: ASTRO_CONFIG, message: 'manca: lo schema delle variabili, `env.schema`, sta lì' }]
  const fields = new Map(envSchema(source).map((field) => [field.key, field]))
  return keys.flatMap((key) => {
    const message = secretGap(key, fields.get(key))
    return message === undefined ? [] : [{ path: ASTRO_CONFIG, message }]
  })
}

// TODO: dalla 0.13.0 i requisiti del database e dell'autenticazione sono errori di doctor: togli `severity`.
const asWarning = (gap: ContractGap): ContractGap => ({ ...gap, severity: 'warning' })

export function databaseAuthGaps(
  files: ProjectFiles,
  manifest: Manifest,
  on: readonly DependencyFeature[],
): ContractGap[] {
  const database = on.includes('database') ? databaseGaps(files, manifest) : []
  const secrets = secretGaps(
    files.read(ASTRO_CONFIG),
    on.map((name) => DEPENDENCY_FEATURES[name].secret),
  )
  return [...database, ...secrets].map(asWarning)
}
