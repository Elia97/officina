import type { Manifest } from './alignment.ts'
import type { ContractGap } from './contract.ts'
import { peerRange, withinRange } from './versions.ts'

// Strumenti che i preset e le action danno per scontati: senza, il progetto sembra allineato e poi
// il primo commit o il primo job li cerca e non li trova.
const REQUIRED: readonly { name: string; reason: string }[] = [
  { name: '@biomejs/biome', reason: 'il progetto estende `@elia97/officina/biome`' },
  { name: 'lefthook', reason: 'il preset dei git hook è suo, e `prepare` lo installa' },
  { name: '@commitlint/cli', reason: 'il preset di lefthook lo lancia su ogni messaggio di commit' },
  { name: '@commitlint/config-conventional', reason: 'è la configurazione che commitlint estende' },
  { name: 'fallow', reason: '`check:deadcode` e `check:health` lo lanciano' },
]

const BIOME = '@biomejs/biome'
const MANIFEST = 'package.json'

// Il preset usa una regola `nursery`, che fra una major e l'altra di Biome cambia nome o sparisce:
// l'intervallo che regge lo dichiara il pacchetto, in un posto solo.
function biomeRangeGap(declared: string): string | undefined {
  const range = peerRange(BIOME)
  return withinRange(declared, range) ? undefined : `\`${BIOME}\` è \`${declared}\`: il preset regge \`${range}\``
}

export function toolingGaps({ devDependencies = {} }: Manifest): ContractGap[] {
  const gaps: ContractGap[] = REQUIRED.filter(({ name }) => devDependencies[name] === undefined).map(
    ({ name, reason }) => ({ path: MANIFEST, message: `\`${name}\` non è fra le devDependencies: ${reason}` }),
  )
  const biome = devDependencies[BIOME]
  const range = biome === undefined ? undefined : biomeRangeGap(biome)
  return range === undefined ? gaps : [...gaps, { path: MANIFEST, message: range }]
}
