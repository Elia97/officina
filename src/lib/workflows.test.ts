import { describe, expect, it } from 'vitest'

import type { ProjectFiles } from './alignment.ts'
import { dependabotGaps, workflowGaps } from './workflows.ts'

const files = (contents: Record<string, string> = {}): ProjectFiles => ({ paths: [], read: (path) => contents[path] })
const messages = (gaps: { message: string }[]) => gaps.map(({ message }) => message)

const SHA = '0123456789abcdef0123456789abcdef01234567'
const VERSION = '0.5.0'

const workflows = (ref: string) => ({
  '.github/workflows/ci.yml': `      - uses: Elia97/officina/actions/ci@${ref}\n      - uses: Elia97/officina/actions/review@${ref}\n`,
  '.github/workflows/deploy.yml': `      - uses: Elia97/officina/actions/deploy@${ref}\n`,
  '.github/workflows/lighthouse.yml': `      - uses: Elia97/officina/actions/lighthouse@${ref}\n`,
})

describe('workflowGaps', () => {
  it('non trova niente quando le action stanno alla versione del pacchetto installato', () => {
    expect(workflowGaps(files(workflows(`v${VERSION}`)), VERSION)).toEqual([])
    expect(workflowGaps(files(workflows(`${SHA} # v${VERSION}`)), VERSION)).toEqual([])
  })

  it('boccia un tag che non è la versione installata: pacchetto e action si muovono insieme', () => {
    expect(messages(workflowGaps(files(workflows('v0.6.0')), VERSION))).toContain(
      '`Elia97/officina/actions/deploy@v0.6.0`: il pacchetto installato è la 0.5.0',
    )
  })

  it('da uno SHA senza commento non si legge nessuna versione, quindi non dice niente', () => {
    expect(messages(workflowGaps(files(workflows(SHA)), VERSION))).toContain(
      '`Elia97/officina/actions/deploy@0123456…`: uno SHA non dice che versione è — scrivila nel commento (`# v0.5.0`)',
    )
  })

  it('boccia uno SHA il cui commento dichiara un’altra versione', () => {
    expect(messages(workflowGaps(files(workflows(`${SHA} # v0.3.1`)), VERSION))).toContain(
      '`Elia97/officina/actions/deploy@0123456… v0.3.1`: il pacchetto installato è la 0.5.0',
    )
  })

  it('boccia un riferimento mobile: in produzione girerebbero passi mai collaudati', () => {
    expect(messages(workflowGaps(files(workflows('main')), VERSION))).toContain(
      '`Elia97/officina/actions/deploy@main`: il riferimento va fissato a un tag di versione o a uno SHA',
    )
  })

  it('distingue il workflow che manca da quello che porta ancora i propri passi', () => {
    const project = files({ '.github/workflows/deploy.yml': '      - run: pnpm dlx vercel@59.22.0 deploy --prod\n' })

    expect(workflowGaps(project, VERSION)).toEqual([
      { path: '.github/workflows/ci.yml', message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/ci`' },
      { path: '.github/workflows/ci.yml', message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/review`' },
      { path: '.github/workflows/deploy.yml', message: 'non usa `Elia97/officina/actions/deploy`' },
      {
        path: '.github/workflows/lighthouse.yml',
        message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/lighthouse`',
      },
    ])
  })

  it('una riga commentata non soddisfa il controllo: in CI quel passo non gira', () => {
    const project = files({
      '.github/workflows/deploy.yml': `      # - uses: Elia97/officina/actions/deploy@v${VERSION}\n`,
    })

    expect(messages(workflowGaps(project, VERSION))).toContain('non usa `Elia97/officina/actions/deploy`')
  })
})

describe('dependabotGaps', () => {
  const grouped = [
    'version: 2',
    'multi-ecosystem-groups:',
    '  officina:',
    '    schedule:',
    '      interval: weekly',
    'updates:',
    '  - package-ecosystem: npm',
    '    patterns: ["@elia97/officina"]',
    '  - package-ecosystem: github-actions',
    '    patterns: ["Elia97/officina/*"]',
  ].join('\n')

  it('non trova niente quando pacchetto e action stanno nello stesso gruppo', () => {
    expect(dependabotGaps(files({ '.github/dependabot.yml': grouped }))).toEqual([])
  })

  it('senza il file lo dice, perché le due PR separate si bocciano a vicenda', () => {
    expect(messages(dependabotGaps(files()))).toEqual(['manca: senza, il pacchetto e le sue action si alzano separati'])
  })

  it('nomina ogni pezzo del gruppo che manca', () => {
    const project = files({ '.github/dependabot.yml': 'version: 2\nupdates:\n  - package-ecosystem: npm\n' })

    expect(dependabotGaps(project)).toHaveLength(3)
  })

  it('non si accontenta di un gruppo scritto in un commento', () => {
    const project = files({
      '.github/dependabot.yml': grouped.replace('multi-ecosystem-groups:', '# multi-ecosystem-groups:'),
    })

    expect(messages(dependabotGaps(project))).toEqual([
      'non nomina `multi-ecosystem-groups`: il pacchetto e le sue action si alzano in una PR sola',
    ])
  })
})
