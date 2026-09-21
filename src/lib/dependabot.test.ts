import { describe, expect, it } from 'vitest'

import type { ProjectFiles } from './alignment.ts'
import { dependabotGaps } from './dependabot.ts'

const files = (contents: Record<string, string> = {}): ProjectFiles => ({ paths: [], read: (path) => contents[path] })

const gapsFor = (source: string): string[] =>
  dependabotGaps(files({ '.github/dependabot.yml': source })).map(({ message }) => message)

const GROUP = ['multi-ecosystem-groups:', '  officina:', '    schedule:', '      interval: weekly'].join('\n')

const grouped = (ecosystem: string, pattern: string | undefined, extra: string[] = []): string =>
  [
    `  - package-ecosystem: ${ecosystem}`,
    ...(pattern === undefined ? [] : [`    patterns: ['${pattern}']`]),
    '    multi-ecosystem-group: officina',
    ...extra,
  ].join('\n')

const rest = (ecosystem: string, extra: string[] = ['    commit-message:', '      prefix: chore(deps)']): string =>
  [`  - package-ecosystem: ${ecosystem}`, ...extra].join('\n')

const file = (...updates: string[]): string => ['version: 2', GROUP, 'updates:', ...updates].join('\n')

const NPM_GROUPED = grouped('npm', '@elia97/officina')
const ACTIONS_GROUPED = grouped('github-actions', 'Elia97/officina/*')
const VALID = file(NPM_GROUPED, rest('npm'), ACTIONS_GROUPED, rest('github-actions'))

describe('il file valido a quattro voci', () => {
  it('non ha mancanze: due voci per ecosistema, una nel gruppo e una per il resto', () => {
    expect(gapsFor(VALID)).toEqual([])
  })
})

describe('il file che non si legge', () => {
  it('assente, lo dice', () => {
    expect(dependabotGaps(files()).map(({ message }) => message)).toEqual([
      'manca: senza, il pacchetto e le sue action si alzano separati',
    ])
  })

  it('non è YAML valido: è una mancanza, non uno stack trace', () => {
    expect(gapsFor('updates:\n  - [\n')[0]).toContain('non è YAML valido')
  })

  it('non è una mappa', () => {
    expect(gapsFor('soltanto una stringa\n')).toEqual(['non è una mappa YAML'])
  })
})

describe('il gruppo', () => {
  it('assente, con qualunque contenuto sotto updates', () => {
    expect(gapsFor('version: 2\n')[0]).toContain('non dichiara `multi-ecosystem-groups`')
  })

  it('vuoto vale come assente', () => {
    expect(gapsFor('multi-ecosystem-groups: {}\n')[0]).toContain('non dichiara `multi-ecosystem-groups`')
  })

  it('citato da una voce ma non definito', () => {
    const source = file(
      NPM_GROUPED.replace('multi-ecosystem-group: officina', 'multi-ecosystem-group: altro'),
      rest('npm'),
      ACTIONS_GROUPED,
      rest('github-actions'),
    )

    expect(gapsFor(source)).toContain('la voce `npm` cita il gruppo `altro`, che non esiste')
  })
})

describe('le chiavi che Dependabot vuole sul gruppo e non sulla voce', () => {
  it.each(['commit-message:\n      prefix: chore(deps)', 'open-pull-requests-limit: 5'])('%s', (extra) => {
    const key = extra.split(':')[0] ?? ''
    const source = file(
      grouped('npm', '@elia97/officina', [`    ${extra}`]),
      rest('npm'),
      ACTIONS_GROUPED,
      rest('github-actions'),
    )

    expect(gapsFor(source)).toContain(
      `\`${key}\` sta sulla voce \`npm\` del gruppo: va sul gruppo, e Dependabot rifiuta il file`,
    )
  })
})

describe('quello che il gruppo deve coprire', () => {
  it('senza patterns non copre niente, e lo dice per tutti e due gli ecosistemi', () => {
    const source = file(
      grouped('npm', undefined),
      rest('npm'),
      grouped('github-actions', undefined),
      rest('github-actions'),
    )

    expect(gapsFor(source)).toEqual([
      'nessuna voce del gruppo copre `@elia97/officina`: il gruppo deve prendere il pacchetto da npm',
      'nessuna voce del gruppo copre `Elia97/officina/*`: il gruppo deve prendere le action da github-actions',
    ])
  })
})

describe('lo spegnimento silenzioso', () => {
  it('un ecosistema che sta solo nella voce del gruppo, con patterns', () => {
    const source = file(NPM_GROUPED, ACTIONS_GROUPED, rest('github-actions'))

    expect(gapsFor(source)).toEqual([
      '`npm` sta solo nella voce del gruppo, con `patterns`: il resto non si aggiorna più',
    ])
  })

  it('la voce del resto senza commit-message: le sue PR non passano il titolo', () => {
    const source = file(NPM_GROUPED, rest('npm', ['    directory: /']), ACTIONS_GROUPED, rest('github-actions'))

    expect(gapsFor(source)).toEqual([
      'la voce `npm` fuori dal gruppo non ha `commit-message`: le sue PR non passano il titolo',
    ])
  })
})
