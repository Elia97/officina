import { describe, expect, it } from 'vitest'

import {
  BIOME_PRESET,
  CI_STEPS,
  configGaps,
  dependencyGaps,
  EXPECTED_SCRIPTS,
  LEFTHOOK_PRESET,
  leftoverGaps,
  type ProjectFiles,
  presetGaps,
  scriptGaps,
  workflowGaps,
} from './alignment.ts'

const alignedScripts = (): Record<string, string> => ({
  ...EXPECTED_SCRIPTS,
  'check:comments': 'officina check comments --strict',
  ci: CI_STEPS.map((step) => `pnpm run ${step}`).join(' && '),
})

const files = (paths: string[], contents: Record<string, string> = {}): ProjectFiles => ({
  paths,
  read: (path) => contents[path],
})

const messages = (gaps: { message: string }[]) => gaps.map(({ message }) => message)

describe('scriptGaps', () => {
  it('non trova niente quando ogni script chiama officina, anche con opzioni in coda', () => {
    expect(scriptGaps({ scripts: alignedScripts() })).toEqual([])
  })

  it('nomina lo script che manca e quello che chiama ancora la copia del repository', () => {
    const scripts: Record<string, string> = { ...alignedScripts(), 'perf:bundle': 'node scripts/bundle-budget.mjs' }
    delete scripts.doctor

    expect(messages(scriptGaps({ scripts }))).toEqual([
      'script `perf:bundle` è `node scripts/bundle-budget.mjs`: atteso `officina check bundle`',
      'script `doctor` assente: atteso `officina doctor`',
    ])
  })

  it('pretende che `ci` lanci i gate sui sorgenti e doctor', () => {
    const gaps = scriptGaps({ scripts: { ...alignedScripts(), ci: 'biome ci . && pnpm run check:language' } })

    expect(messages(gaps)).toEqual([
      'script `ci` non lancia `check:routes`',
      'script `ci` non lancia `check:roadmap`',
      'script `ci` non lancia `check:comments`',
      'script `ci` non lancia `doctor`',
    ])
  })

  it('su un package.json senza script li elenca tutti, `ci` compreso', () => {
    expect(scriptGaps({})).toHaveLength(Object.keys(EXPECTED_SCRIPTS).length + CI_STEPS.length)
  })
})

describe('dependencyGaps', () => {
  it('non trova niente con officina fra le devDependencies e senza plop né ts-morph', () => {
    expect(dependencyGaps({ devDependencies: { '@elia97/officina': '^0.4.0' } })).toEqual([])
  })

  it('nomina le dipendenze che ora porta il pacchetto, ovunque siano dichiarate, e officina se manca', () => {
    const gaps = dependencyGaps({ dependencies: { 'ts-morph': '^28.0.0' }, devDependencies: { plop: '^4.0.5' } })

    expect(messages(gaps)).toEqual([
      '`plop` non serve più al progetto: è una dipendenza di officina',
      '`ts-morph` non serve più al progetto: è una dipendenza di officina',
      '`@elia97/officina` non è fra le devDependencies',
    ])
  })
})

describe('leftoverGaps', () => {
  it('non trova niente in un repository che tiene solo i propri script', () => {
    const project = files(['scripts/bootstrap-github.sh', 'scripts/lib/cloudinary-probe.ts', '.claude/settings.json'], {
      '.claude/settings.json': '{ "permissions": {} }',
      '.mcp.json': '{ "mcpServers": { "figma": {} } }',
    })

    expect(leftoverGaps(project)).toEqual([])
  })

  it('riconosce una cartella da un file qualunque sotto di lei, e un file dal suo percorso esatto', () => {
    const gaps = leftoverGaps(
      files(['.claude/agents/ui-agent.md', 'plopfile.mjs', 'docs/PROJECT.md', 'plopfile.mjs.bak']),
    )

    expect(gaps).toEqual([
      { path: '.claude/agents/', message: 'residuo: arriva dal plugin `metodo`' },
      { path: 'plopfile.mjs', message: 'residuo: arriva da officina' },
      { path: 'docs/PROJECT.md', message: 'residuo: sta nella cartella del progetto, fuori dal repository' },
    ])
  })

  it('legge dentro settings.json e .mcp.json: gli hook e il server Astro ora li porta il plugin', () => {
    const project = files([], {
      '.claude/settings.json': '{ "hooks": { "PreToolUse": [] } }',
      '.mcp.json': '{ "mcpServers": { "astro-docs": {} } }',
    })

    expect(leftoverGaps(project).map(({ path }) => path)).toEqual(['.claude/settings.json', '.mcp.json'])
  })
})

describe('presetGaps', () => {
  it('non trova niente quando Biome e lefthook estendono i preset del pacchetto', () => {
    const project = files([], {
      'biome.json': `{ "extends": ["${BIOME_PRESET}"] }`,
      'lefthook.yml': `extends:\n  - ${LEFTHOOK_PRESET}\n`,
    })

    expect(presetGaps(project)).toEqual([])
  })

  it('nomina la configurazione che resta una copia, o che manca', () => {
    expect(presetGaps(files([], { 'biome.json': '{ "linter": {} }' })).map(({ path }) => path)).toEqual([
      'biome.json',
      'lefthook.yml',
    ])
  })
})

describe('configGaps', () => {
  it('non trova niente in una configurazione con URL e colore delle icone', () => {
    expect(configGaps({ siteUrl: 'https://prova.test', icons: { background: '#fafafa' } })).toEqual([])
  })

  it('distingue il file che manca da quello che non si carica', () => {
    expect(messages(configGaps(undefined))).toEqual(['manca: i valori del progetto per officina stanno qui'])
    expect(messages(configGaps(new Error("Cannot find module '@/lib/site'")))).toEqual([
      "non si carica: Cannot find module '@/lib/site'",
    ])
  })

  it('nomina le due voci che i comandi pretendono', () => {
    expect(messages(configGaps({}))).toEqual([
      '`siteUrl` assente: `check smoke` non ha un host canonico',
      '`icons.background` assente: `gen icons` non ha un colore di fondo',
    ])
  })

  it('boccia un siteUrl che non è un URL, o che porta la barra finale', () => {
    const icons = { background: '#fafafa' }

    expect(messages(configGaps({ siteUrl: 'prova.test', icons }))).toEqual(['`siteUrl` non è un URL: `prova.test`'])
    expect(messages(configGaps({ siteUrl: 'https://prova.test/', icons }))).toEqual([
      '`siteUrl` finisce con una barra: `https://prova.test/`',
    ])
  })
})

describe('workflowGaps', () => {
  const workflows = (ref: string) => ({
    '.github/workflows/ci.yml': `- uses: Elia97/officina/actions/ci@${ref}\n- uses: Elia97/officina/actions/review@${ref}\n`,
    '.github/workflows/deploy.yml': `- uses: Elia97/officina/actions/deploy@${ref}\n`,
    '.github/workflows/lighthouse.yml': `- uses: Elia97/officina/actions/lighthouse@${ref}\n`,
  })

  it('non trova niente quando i workflow prendono i passi da officina, fissati a un tag o a uno SHA', () => {
    expect(workflowGaps(files([], workflows('v0.4.0')))).toEqual([])
    expect(workflowGaps(files([], workflows('0123456789abcdef0123456789abcdef01234567')))).toEqual([])
  })

  it('boccia un riferimento mobile: in produzione girerebbero passi mai collaudati', () => {
    expect(messages(workflowGaps(files([], workflows('main'))))).toContain(
      '`Elia97/officina/actions/deploy@main`: il riferimento va fissato a un tag di versione o a uno SHA',
    )
  })

  it('distingue il workflow che manca da quello che porta ancora i propri passi', () => {
    const project = files([], {
      '.github/workflows/deploy.yml': '- run: pnpm dlx vercel@59 deploy --prebuilt --prod\n',
    })

    expect(workflowGaps(project)).toEqual([
      { path: '.github/workflows/ci.yml', message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/ci`' },
      { path: '.github/workflows/ci.yml', message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/review`' },
      { path: '.github/workflows/deploy.yml', message: 'non usa `Elia97/officina/actions/deploy`' },
      {
        path: '.github/workflows/lighthouse.yml',
        message: 'manca: i suoi passi arrivano da `Elia97/officina/actions/lighthouse`',
      },
    ])
  })
})
