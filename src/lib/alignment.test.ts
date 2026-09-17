import { describe, expect, it } from 'vitest'

import {
  BIOME_PRESET,
  CI_STEPS,
  dependencyGaps,
  EXPECTED_SCRIPTS,
  LEFTHOOK_PRESET,
  leftoverGaps,
  type ProjectFiles,
  presetGaps,
  scriptGaps,
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

  it('legge JSON, non stringhe: «hooks» dentro un valore qualunque non è un blocco hooks', () => {
    const project = files([], {
      '.claude/settings.json': '{ "permissions": { "allow": ["Bash(pnpm run hooks)"] } }',
      '.mcp.json': '{ "note": "niente astro-docs qui" }',
    })

    expect(leftoverGaps(project)).toEqual([])
  })

  it('su un JSON illeggibile, o che non è un oggetto, non afferma niente', () => {
    const project = files([], { '.claude/settings.json': '{ "hooks": ', '.mcp.json': '[]' })

    expect(leftoverGaps(project)).toEqual([])
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

  it('vuole il preset dentro `extends`, non nominato da qualche altra parte nel file', () => {
    const project = files([], { 'biome.json': `{ "linter": { "nota": "${BIOME_PRESET}" } }` })

    expect(presetGaps(project).map(({ path }) => path)).toContain('biome.json')
  })

  it('non si accontenta di una riga commentata in lefthook.yml', () => {
    const project = files([], {
      'biome.json': `{ "extends": ["${BIOME_PRESET}"] }`,
      'lefthook.yml': `extends:\n  # - ${LEFTHOOK_PRESET}\n`,
    })

    expect(presetGaps(project).map(({ path }) => path)).toEqual(['lefthook.yml'])
  })
})
