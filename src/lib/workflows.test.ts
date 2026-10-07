import { describe, expect, it } from 'vitest'

import type { ProjectFiles } from './alignment.ts'
import { actionInputGaps, workflowGaps } from './workflows.ts'

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

const CI_INPUTS = {
  workflow: '.github/workflows/ci.yml',
  action: 'ci',
  inputs: [
    { name: 'migrate', reason: 'senza migrazioni' },
    { name: 'database-url', reason: 'senza database' },
  ],
}

const ci = (steps: string) =>
  files({
    '.github/workflows/ci.yml': `jobs:\n  ci:\n    steps:\n      - uses: actions/checkout@v7\n      - run: pnpm install\n${steps}`,
  })

const officinaStep = (inputs: string) => `      - uses: Elia97/officina/actions/ci@v${VERSION}\n${inputs}`

describe('actionInputGaps', () => {
  it("non trova niente quando il passo dell'action riceve ogni input", () => {
    const step = officinaStep(
      '        with:\n          migrate: db:migrate\n          database-url: postgres://branch-di-test\n',
    )

    expect(actionInputGaps(ci(step), CI_INPUTS)).toEqual([])
  })

  it('nomina gli input assenti, commentati o senza valore', () => {
    const commented = officinaStep('        with:\n          # migrate: db:migrate\n          database-url:\n')
    const empty = officinaStep(
      "        with:\n          migrate: ''\n          database-url: postgres://branch-di-test\n",
    )

    expect(messages(actionInputGaps(ci(commented), CI_INPUTS))).toEqual([
      '`Elia97/officina/actions/ci` non riceve `migrate`: senza migrazioni',
      '`Elia97/officina/actions/ci` non riceve `database-url`: senza database',
    ])
    expect(actionInputGaps(ci(officinaStep('')), CI_INPUTS)).toHaveLength(2)
    expect(messages(actionInputGaps(ci(empty), CI_INPUTS))).toEqual([
      '`Elia97/officina/actions/ci` non riceve `migrate`: senza migrazioni',
    ])
  })

  it('tace quando il workflow o il passo non ci sono: lo dice già workflowGaps', () => {
    const reusable = 'jobs:\n  build:\n    uses: ./.github/workflows/build.yml\n  vuoto:\n'

    expect(actionInputGaps(files(), CI_INPUTS)).toEqual([])
    expect(actionInputGaps(ci('      - una-stringa\n'), CI_INPUTS)).toEqual([])
    expect(actionInputGaps(files({ '.github/workflows/ci.yml': '' }), CI_INPUTS)).toEqual([])
    expect(actionInputGaps(files({ '.github/workflows/ci.yml': 'name: CI\n' }), CI_INPUTS)).toEqual([])
    expect(actionInputGaps(files({ '.github/workflows/ci.yml': reusable }), CI_INPUTS)).toEqual([])
  })

  it('dice quando il workflow non si legge come YAML, anche per un alias senza ancora', () => {
    const unclosed = files({ '.github/workflows/ci.yml': 'jobs: [aperta\n' })
    const alias = ci(officinaStep('        with:\n          migrate: *script\n'))

    expect(messages(actionInputGaps(unclosed, CI_INPUTS))).toEqual([expect.stringMatching(/^non è YAML valido: /)])
    expect(messages(actionInputGaps(alias, CI_INPUTS))).toEqual([
      expect.stringMatching(/^non è YAML valido: ReferenceError: Unresolved alias/),
    ])
  })
})

describe('actionInputGaps e il segreto che un input non deve ricevere', () => {
  it('lo nomina quando il valore lo cita, ma non per un nome che lo contiene', () => {
    const inputs = {
      ...CI_INPUTS,
      inputs: [
        {
          name: 'database-url',
          reason: 'senza database',
          notFrom: { secret: 'PRODUCTION_URL', reason: 'è la produzione' },
        },
      ],
    }
    const from = (name: string) => ci(officinaStep(`        with:\n          database-url: \${{ secrets.${name} }}\n`))

    expect(messages(actionInputGaps(from('PRODUCTION_URL'), inputs))).toEqual([
      '`Elia97/officina/actions/ci` riceve `database-url` da `PRODUCTION_URL`: è la produzione',
    ])
    expect(actionInputGaps(from('OLD_PRODUCTION_URL'), inputs)).toEqual([])
  })
})
