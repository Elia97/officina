import type { ProjectFiles } from '../alignment.ts'
import type { ContractGap } from '../contract.ts'
import { dependabotGaps } from '../dependabot.ts'

export const files = (contents: Record<string, string> = {}): ProjectFiles => ({
  paths: [],
  read: (path) => contents[path],
})

export const findingsFor = (source: string): ContractGap[] =>
  dependabotGaps(files({ '.github/dependabot.yml': source }))

export const gapsFor = (source: string): string[] => findingsFor(source).map(({ message }) => message)

const GROUP = ['multi-ecosystem-groups:', '  officina:', '    schedule:', '      interval: weekly'].join('\n')

export const COMMIT = ['    commit-message:', '      prefix: chore(deps)']

export const grouped = (ecosystem: string, patterns: readonly string[], extra: string[] = []): string =>
  [
    `  - package-ecosystem: ${ecosystem}`,
    ...(patterns.length === 0 ? [] : [`    patterns: [${patterns.map((p) => `'${p}'`).join(', ')}]`]),
    '    multi-ecosystem-group: officina',
    ...extra,
  ].join('\n')

export const rest = (ecosystem: string, extra: string[] = COMMIT): string =>
  [`  - package-ecosystem: ${ecosystem}`, ...extra].join('\n')

export const file = (...updates: string[]): string => ['version: 2', GROUP, 'updates:', ...updates].join('\n')

export const ignoring = (...names: string[]): string[] => [
  '    ignore:',
  ...names.map((name) => `      - dependency-name: '${name}'`),
]

export const NPM_PATTERNS = ['@elia97/officina', '@biomejs/biome']

export const BIOME_MAJOR = [
  '    ignore:',
  "      - dependency-name: '@biomejs/biome'",
  "        update-types: ['version-update:semver-major']",
]

export const NPM_COOLDOWN = ['    cooldown:', '      default-days: 7', '      exclude:', "        - '@elia97/officina'"]

export const ACTIONS_COOLDOWN = ['    cooldown:', '      exclude:', "        - 'Elia97/officina'"]

// Forma del `.github/dependabot.yml` del template vetrina.
export const NPM_GROUPED = grouped('npm', NPM_PATTERNS, [...NPM_COOLDOWN, ...BIOME_MAJOR])
export const NPM_REST = rest('npm', [...COMMIT, ...ignoring('@elia97/officina', '@biomejs/biome')])
export const ACTIONS_GROUPED = grouped('github-actions', ['Elia97/officina'], ACTIONS_COOLDOWN)
export const ACTIONS_REST = rest('github-actions', [...COMMIT, ...ignoring('Elia97/officina')])
export const VALID = file(NPM_GROUPED, NPM_REST, ACTIONS_GROUPED, ACTIONS_REST)
