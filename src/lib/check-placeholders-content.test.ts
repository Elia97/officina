import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { contentFindings, placeholderSources } from './check-placeholders.ts'

describe('contentFindings', () => {
  it.each([
    ["  public_id: '<PUBLIC_ID>'", 'segnaposto del template <PUBLIC_ID>'],
    ['title: <SECTION_TITLE>', 'segnaposto del template <SECTION_TITLE>'],
    ['  src: ../../assets/placeholder.jpg', 'foto di prova assets/placeholder.jpg'],
    ['email: info@example.com', 'dominio segnaposto example.com'],
    ['* Scrivici a info@example.com', 'dominio segnaposto example.com'],
    ["phone: '+39 000 000 0000'", 'telefono segnaposto +39 000 000 0000'],
  ])('trova %s, anche senza apici o in una voce d’elenco Markdown', (line, message) => {
    expect(contentFindings(`section: gallery\n${line}\n`)).toEqual([{ line: 2, message }])
  })

  it('accetta il contenuto di un progetto vero', () => {
    const source = [
      'section: gallery',
      'title: I nostri lavori',
      'body: >-',
      "  Dall'idea al cantiere, un progetto alla volta.",
      'image:',
      '  src: ../../assets/cantiere.jpg',
      "  alt: Il cantiere di via Roma all'alba",
      'buttons: []',
    ].join('\n')

    expect(contentFindings(source)).toEqual([])
  })
})

describe('placeholderSources con src/content', () => {
  let previous = ''
  let root = ''

  const project = (paths: string[]) => {
    for (const path of paths) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), '')
    }
  }

  beforeEach(() => {
    previous = process.cwd()
    root = mkdtempSync(join(tmpdir(), 'officina-contenuto-'))
    process.chdir(root)
  })

  afterEach(() => {
    process.chdir(previous)
    rmSync(root, { recursive: true, force: true })
  })

  it('aggiunge ogni file di contenuto, e non le immagini né i segnaposto di git', () => {
    project([
      'src/content/homepage/hero.yml',
      'src/content/blog/primo.mdx',
      'src/content/settings/company.json',
      'src/content/news/.gitkeep',
      'src/content/blog/copertina.jpg',
    ])

    expect(placeholderSources()).toEqual([
      'src/lib/site.ts',
      'src/lib/company.ts',
      'src/content/blog/primo.mdx',
      'src/content/homepage/hero.yml',
      'src/content/settings/company.json',
    ])
  })

  it('lo aggiunge anche a una lista dichiarata, senza ripetere un file già elencato', () => {
    project(['src/content/settings/company.json', 'src/content/homepage/hero.yml'])
    const sources = ['src/content/settings/company.json']

    expect(placeholderSources({ placeholders: { sources } })).toEqual([
      'src/content/settings/company.json',
      'src/content/homepage/hero.yml',
    ])
  })

  it('senza src/content resta alla lista di prima', () => {
    expect(placeholderSources({ placeholders: { sources: ['src/lib/site.ts'] } })).toEqual(['src/lib/site.ts'])
  })
})
