import { describe, expect, it } from 'vitest'

import { dependabotGaps } from './dependabot.ts'
import {
  ACTIONS_GROUPED,
  ACTIONS_REST,
  BIOME_MAJOR,
  COMMIT,
  file,
  files,
  gapsFor,
  grouped,
  ignoring,
  NPM_COOLDOWN,
  NPM_GROUPED,
  NPM_PATTERNS,
  NPM_REST,
  rest,
  VALID,
} from './test-helpers/dependabot-files.ts'

describe('il file valido a quattro voci', () => {
  it('nella forma di vetrina non ha mancanze: due voci per ecosistema, una nel gruppo e una per il resto', () => {
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
      NPM_REST,
      ACTIONS_GROUPED,
      ACTIONS_REST,
    )

    expect(gapsFor(source)).toContain('la voce `npm` cita il gruppo `altro`, che non esiste')
  })
})

describe('le chiavi che Dependabot vuole sul gruppo e non sulla voce', () => {
  it.each(['commit-message:\n      prefix: chore(deps)', 'open-pull-requests-limit: 5'])('%s', (extra) => {
    const key = extra.split(':')[0] ?? ''
    const source = file(
      grouped('npm', NPM_PATTERNS, [...NPM_COOLDOWN, ...BIOME_MAJOR, `    ${extra}`]),
      NPM_REST,
      ACTIONS_GROUPED,
      ACTIONS_REST,
    )

    expect(gapsFor(source)).toContain(
      `\`${key}\` sta sulla voce \`npm\` del gruppo: va sul gruppo, e Dependabot rifiuta il file`,
    )
  })
})

describe('quello che il gruppo deve coprire', () => {
  it('senza patterns non copre niente, e lo dice per ogni dipendenza del gruppo', () => {
    const source = file(grouped('npm', []), rest('npm'), grouped('github-actions', []), rest('github-actions'))

    expect(gapsFor(source)).toEqual([
      'nessuna voce del gruppo copre `@elia97/officina`: il gruppo deve prendere il pacchetto da npm',
      'nessuna voce del gruppo copre `@biomejs/biome`: il preset di officina nomina regole che una minor di Biome può rinominare, e i due aggiornamenti vanno in una PR sola',
      'nessuna voce del gruppo copre `Elia97/officina`: il gruppo deve prendere le action da github-actions',
    ])
  })
})

describe('il filtro sul percorso delle action, che Dependabot non riconosce', () => {
  const PATH_FILTER_GAP =
    '`Elia97/officina/*` non corrisponde a nessuna dipendenza: Dependabot chiama le action `Elia97/officina`, senza la sottocartella, e il filtro va corretto ovunque compaia'
  const EXCLUDED = [
    '    groups:',
    '      github-actions:',
    "        patterns: ['*']",
    "        exclude-patterns: ['Elia97/officina/*']",
  ]

  it("nei patterns del gruppo e nell'ignore del resto, come in red-solutions: una mancanza sola per il filtro", () => {
    const source = file(
      NPM_GROUPED,
      NPM_REST,
      grouped('github-actions', ['Elia97/officina/*']),
      rest('github-actions', [...COMMIT, ...ignoring('Elia97/officina/*')]),
    )

    expect(gapsFor(source)).toEqual([
      'nessuna voce del gruppo copre `Elia97/officina`: il gruppo deve prendere le action da github-actions',
      PATH_FILTER_GAP,
    ])
  })

  it.each([
    { place: 'ignore', extra: ignoring('Elia97/officina', 'Elia97/officina/*') },
    { place: 'exclude-patterns', extra: [...ignoring('Elia97/officina'), ...EXCLUDED] },
  ])('con il gruppo corretto e il filtro rimasto nel resto, in $place', ({ extra }) => {
    const source = file(NPM_GROUPED, NPM_REST, ACTIONS_GROUPED, rest('github-actions', [...COMMIT, ...extra]))

    expect(gapsFor(source)).toEqual([PATH_FILTER_GAP])
  })
})

describe('lo spegnimento silenzioso', () => {
  it('un ecosistema che sta solo nella voce del gruppo, con patterns', () => {
    const source = file(NPM_GROUPED, ACTIONS_GROUPED, ACTIONS_REST)

    expect(gapsFor(source)).toEqual([
      '`npm` sta solo nella voce del gruppo, con `patterns`: il resto non si aggiorna più',
    ])
  })

  it('la voce del resto senza commit-message: le sue PR non passano il titolo', () => {
    const source = file(
      NPM_GROUPED,
      rest('npm', ['    directory: /', ...ignoring('@elia97/officina', '@biomejs/biome')]),
      ACTIONS_GROUPED,
      ACTIONS_REST,
    )

    expect(gapsFor(source)).toEqual([
      'la voce `npm` fuori dal gruppo non ha `commit-message`: le sue PR non passano il titolo',
    ])
  })
})
