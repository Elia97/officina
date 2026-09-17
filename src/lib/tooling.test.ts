import { describe, expect, it } from 'vitest'

import { toolingGaps } from './tooling.ts'
import { peerRange } from './versions.ts'

const messages = (gaps: { message: string }[]) => gaps.map(({ message }) => message)

const complete = (biome = '2.5.10'): Record<string, string> => ({
  '@biomejs/biome': biome,
  lefthook: '^2.1.10',
  '@commitlint/cli': '^21.2.2',
  '@commitlint/config-conventional': '^21.2.2',
  fallow: '^3.26.0',
})

describe('toolingGaps', () => {
  it('non trova niente quando il progetto ha gli strumenti che preset e action danno per scontati', () => {
    expect(toolingGaps({ devDependencies: complete() })).toEqual([])
  })

  it('nomina ogni strumento mancante e a chi serve', () => {
    expect(messages(toolingGaps({ devDependencies: { '@biomejs/biome': '2.5.10' } }))).toEqual([
      '`lefthook` non è fra le devDependencies: il preset dei git hook è suo, e `prepare` lo installa',
      '`@commitlint/cli` non è fra le devDependencies: il preset di lefthook lo lancia su ogni messaggio di commit',
      '`@commitlint/config-conventional` non è fra le devDependencies: è la configurazione che commitlint estende',
      '`fallow` non è fra le devDependencies: `check:deadcode` e `check:health` lo lanciano',
    ])
  })

  it('confronta la versione di Biome con l’intervallo che il preset dichiara di reggere', () => {
    const range = peerRange('@biomejs/biome')

    expect(messages(toolingGaps({ devDependencies: complete('^2.4.0') }))).toEqual([
      `\`@biomejs/biome\` è \`^2.4.0\`: il preset regge \`${range}\``,
    ])
  })

  it('su un progetto senza devDependencies elenca tutto, e della versione non dice niente', () => {
    expect(toolingGaps({})).toHaveLength(5)
  })
})
