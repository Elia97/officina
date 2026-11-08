import { describe, expect, it } from 'vitest'

import {
  ACTIONS_COOLDOWN,
  ACTIONS_GROUPED,
  ACTIONS_REST,
  BIOME_MAJOR,
  COMMIT,
  file,
  findingsFor,
  gapsFor,
  grouped,
  ignoring,
  NPM_COOLDOWN,
  NPM_GROUPED,
  NPM_PATTERNS,
  NPM_REST,
  rest,
} from './test-helpers/dependabot-files.ts'

const npmGrouped = (extra: string[], patterns: readonly string[] = NPM_PATTERNS): string =>
  grouped('npm', patterns, extra)

const actionsGrouped = (extra: string[]): string => grouped('github-actions', ['Elia97/officina'], extra)

const restIgnoreGap = (ecosystem: string, needle: string): string =>
  `la voce \`${ecosystem}\` fuori dal gruppo non ignora \`${needle}\`, che il gruppo copre: serve un \`ignore\` con il solo \`dependency-name\`, altrimenti la stessa dipendenza la alzano due voci, in due PR`

const cooldownGap = (pkg: string, action: string): string =>
  `il cooldown di \`@elia97/officina\` nella voce \`npm\` del gruppo è di ${pkg}, quello di \`Elia97/officina\` nella voce \`github-actions\` di ${action}: finché non coincidono la PR del gruppo porta il pacchetto e le action a versioni diverse, e il controllo sulla stessa versione la boccia`

describe('Biome nel gruppo', () => {
  it('fuori dal gruppo è un avviso: il requisito è nuovo', () => {
    const source = file(
      npmGrouped(NPM_COOLDOWN, ['@elia97/officina']),
      rest('npm', [...COMMIT, ...ignoring('@elia97/officina')]),
      ACTIONS_GROUPED,
      ACTIONS_REST,
    )

    expect(findingsFor(source)).toEqual([
      {
        path: '.github/dependabot.yml',
        severity: 'warning',
        message:
          'nessuna voce del gruppo copre `@biomejs/biome`: il preset di officina nomina regole che una minor di Biome può rinominare, e i due aggiornamenti vanno in una PR sola',
      },
    ])
  })

  it.each([
    { ignore: [] as string[], case: 'senza ignore' },
    { ignore: ignoring('@biomejs/biome'), case: 'con un ignore intero, che toglie Biome dal gruppo' },
    { ignore: ['    ignore:', "      - update-types: ['version-update:semver-major']"], case: 'senza il nome' },
  ])('le major ignorate dalla voce del gruppo: $case', ({ ignore }) => {
    const source = file(npmGrouped([...NPM_COOLDOWN, ...ignore]), NPM_REST, ACTIONS_GROUPED, ACTIONS_REST)

    expect(findingsFor(source)).toEqual([
      {
        path: '.github/dependabot.yml',
        severity: 'warning',
        message:
          'la voce `npm` del gruppo non ignora le major di `@biomejs/biome`: il preset di officina regge Biome fino alla 3 esclusa',
      },
    ])
  })

  it('le major ignorate con un nome generico valgono anche per Biome', () => {
    const anyMajor = [
      '    ignore:',
      "      - dependency-name: '*'",
      "        update-types: ['version-update:semver-major']",
    ]

    expect(gapsFor(file(npmGrouped([...NPM_COOLDOWN, ...anyMajor]), NPM_REST, ACTIONS_GROUPED, ACTIONS_REST))).toEqual(
      [],
    )
  })
})

describe('la voce del resto ignora quello che il gruppo copre', () => {
  it.each([
    { ecosystem: 'npm', needle: '@elia97/officina', others: ['@biomejs/biome'] },
    { ecosystem: 'npm', needle: '@biomejs/biome', others: ['@elia97/officina'] },
  ])('npm senza $needle', ({ ecosystem, needle, others }) => {
    const source = file(NPM_GROUPED, rest('npm', [...COMMIT, ...ignoring(...others)]), ACTIONS_GROUPED, ACTIONS_REST)

    expect(gapsFor(source)).toEqual([restIgnoreGap(ecosystem, needle)])
  })

  it('github-actions senza Elia97/officina', () => {
    const source = file(NPM_GROUPED, NPM_REST, ACTIONS_GROUPED, rest('github-actions'))

    expect(gapsFor(source)).toEqual([restIgnoreGap('github-actions', 'Elia97/officina')])
  })

  it('un ignore limitato ad alcuni salti non basta: gli altri li alza ancora la voce del resto', () => {
    const partial = [
      ...ignoring('@elia97/officina', '@biomejs/biome'),
      "        update-types: ['version-update:semver-major']",
    ]

    expect(gapsFor(file(NPM_GROUPED, rest('npm', [...COMMIT, ...partial]), ACTIONS_GROUPED, ACTIONS_REST))).toEqual([
      restIgnoreGap('npm', '@biomejs/biome'),
    ])
  })

  it('un nome generico copre il pacchetto e Biome', () => {
    const source = file(NPM_GROUPED, rest('npm', [...COMMIT, ...ignoring('@*')]), ACTIONS_GROUPED, ACTIONS_REST)

    expect(gapsFor(source)).toEqual([])
  })
})

describe('lo stesso cooldown per pacchetto e action', () => {
  it("con l'exclude tolto dalla voce npm: il pacchetto aspetta 7 giorni, le action nessuno", () => {
    const source = file(
      npmGrouped(['    cooldown:', '      default-days: 7', ...BIOME_MAJOR]),
      NPM_REST,
      ACTIONS_GROUPED,
      ACTIONS_REST,
    )

    expect(findingsFor(source)).toEqual([
      { path: '.github/dependabot.yml', severity: 'warning', message: cooldownGap('7 giorni', '0 giorni') },
    ])
  })

  it("con l'exclude tolto dalla voce github-actions: senza la chiave Dependabot applica 3 giorni", () => {
    const source = file(NPM_GROUPED, NPM_REST, actionsGrouped([]), ACTIONS_REST)

    expect(gapsFor(source)).toEqual([cooldownGap('0 giorni', '3 giorni')])
  })

  it('i giorni delle minor e delle patch del pacchetto si confrontano con quelli delle action', () => {
    const npm = ['    cooldown:', '      default-days: 1', '      semver-minor-days: 2', ...BIOME_MAJOR]
    const actions = ['    cooldown:', '      default-days: 1']
    const source = file(npmGrouped(npm), NPM_REST, actionsGrouped(actions), ACTIONS_REST)

    expect(gapsFor(source)).toEqual([cooldownGap('2 giorni sulle minor e 1 giorno sulle patch', '1 giorno')])
  })

  it.each([
    { include: 'typescript', case: 'fuori da un include non vuoto, il pacchetto non ha cooldown', gaps: [] },
    { include: '@elia97/*', case: 'dentro un include, valgono i giorni della voce', gaps: ['7 giorni'] },
  ])('$case', ({ include, gaps }) => {
    const npm = ['    cooldown:', '      default-days: 7', '      include:', `        - '${include}'`, ...BIOME_MAJOR]
    const source = file(npmGrouped(npm), NPM_REST, actionsGrouped(ACTIONS_COOLDOWN), ACTIONS_REST)

    expect(gapsFor(source)).toEqual(gaps.map((days) => cooldownGap(days, '0 giorni')))
  })
})
