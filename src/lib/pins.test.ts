import { describe, expect, it } from 'vitest'

import { type PinSite, pinFindings } from './pins.ts'

const ACTION = 'actions/deploy/action.yml'
const GATE = 'src/checks/lighthouse.ts'

const site = (source: string, path = ACTION): [PinSite] => [{ path, source }]
const messages = (hits: { message: string }[]) => hits.map(({ message }) => message)

const deploy = (version: string) =>
  [`      - run: pnpm dlx vercel@${version} pull --yes`, `      - run: pnpm dlx vercel@${version} build --prod`].join(
    '\n',
  )

describe('pinFindings', () => {
  it('non trova niente quando il pin è esatto e sulla major pubblicata', () => {
    expect(pinFindings('vercel', '59.22.0', site(deploy('59.22.0')))).toEqual([])
  })

  it('dice dove il pin è sparito del tutto', () => {
    expect(pinFindings('vercel', '59.22.0', site('- run: pnpm dlx vercel pull\n'))).toEqual([
      { path: ACTION, line: 1, message: 'nessun `vercel@<x.y.z>`: il pin è sparito' },
    ])
  })

  it('pretende il pin per intero: una major ridà una CLI diversa ogni settimana', () => {
    const hits = pinFindings('vercel', '59.22.0', site(deploy('59')))

    expect(messages(hits)).toEqual([
      'vercel@59: il pin va scritto per intero, `x.y.z`',
      'vercel@59: il pin va scritto per intero, `x.y.z`',
    ])
    expect(hits.map(({ line }) => line)).toEqual([1, 2])
  })

  it('boccia due pin diversi, anche fra file diversi', () => {
    const sites: [PinSite, PinSite] = [
      { path: ACTION, source: deploy('59.22.0') },
      { path: GATE, source: "spawnSync('pnpm', ['dlx', 'vercel@59.21.0'])\n" },
    ]

    expect(messages(pinFindings('vercel', '59.22.0', sites))).toEqual([
      'vercel@59.22.0: il pin non è lo stesso ovunque (59.21.0, 59.22.0)',
      'vercel@59.22.0: il pin non è lo stesso ovunque (59.21.0, 59.22.0)',
      'vercel@59.21.0: il pin non è lo stesso ovunque (59.21.0, 59.22.0)',
    ])
  })
})

describe('il pin contro quello che npm pubblica', () => {
  it('segnala una major più nuova su npm, sulla riga di ogni pin', () => {
    expect(messages(pinFindings('vercel', '60.0.1', site(deploy('59.22.0'))))).toEqual([
      'vercel@59.22.0: su npm è pubblicata la major 60',
      'vercel@59.22.0: su npm è pubblicata la major 60',
    ])
  })

  it('non pretende di aggiornare verso una major più vecchia di quella fissata', () => {
    expect(pinFindings('vercel', '58.9.0', site(deploy('59.22.0')))).toEqual([])
  })

  it('dice quando è la versione pubblicata a non leggersi', () => {
    expect(messages(pinFindings('vercel', 'next', site(deploy('59.22.0'))))).toEqual([
      'versione pubblicata illeggibile: "next"',
    ])
  })

  it('legge un nome con lo scope senza confonderlo con un altro pacchetto', () => {
    const source = "const { status } = spawnSync('pnpm', ['dlx', '@lhci/cli@0.15.1', 'autorun'])\n"

    expect(pinFindings('@lhci/cli', '0.15.1', site(source, GATE))).toEqual([])
    expect(messages(pinFindings('vercel', '59.22.0', site(source, GATE)))).toEqual([
      'nessun `vercel@<x.y.z>`: il pin è sparito',
    ])
  })

  it('non scambia per un pin un nome più lungo che finisce allo stesso modo', () => {
    expect(messages(pinFindings('vercel', '59.22.0', site('- run: pnpm dlx not-vercel@1.0.0 build\n')))).toEqual([
      'nessun `vercel@<x.y.z>`: il pin è sparito',
    ])
  })
})
