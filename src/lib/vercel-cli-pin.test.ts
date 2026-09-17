import { describe, expect, it } from 'vitest'

import { pinFindings } from './vercel-cli-pin.ts'

const workflow = (...majors: number[]): string =>
  [
    'jobs:',
    '  deploy:',
    '    steps:',
    ...majors.map((major) => `      - run: pnpm dlx vercel@${major} pull --yes`),
  ].join('\n')

describe('pinFindings', () => {
  it('tace quando i passi sono sulla major pubblicata', () => {
    expect(pinFindings(workflow(59, 59, 59), '59.17.0')).toEqual([])
  })

  it('tace quando il pin è già avanti', () => {
    expect(pinFindings(workflow(60), '59.17.0')).toEqual([])
  })

  it('segnala ogni passo quando esce una major nuova', () => {
    expect(pinFindings(workflow(58, 58), '59.17.0')).toEqual([
      { line: 4, message: 'vercel@58: su npm è pubblicata la major 59' },
      { line: 5, message: 'vercel@58: su npm è pubblicata la major 59' },
    ])
  })

  it('segnala i passi che portano major diverse fra loro', () => {
    expect(pinFindings(workflow(58, 59), '59.17.0')).toEqual([
      { line: 4, message: 'vercel@58: il workflow porta major diverse (58, 59)' },
      { line: 5, message: 'vercel@59: il workflow porta major diverse (58, 59)' },
    ])
  })

  it('segnala un workflow senza pin, invece di dichiararlo aggiornato', () => {
    expect(pinFindings('      - run: pnpm dlx vercel pull --yes', '59.17.0')).toEqual([
      { line: 1, message: 'nessun `vercel@<major>`: il pin è sparito dal workflow' },
    ])
  })

  it('segnala una versione pubblicata illeggibile invece di crederle', () => {
    expect(pinFindings(workflow(59), 'latest')).toEqual([
      { line: 1, message: 'versione pubblicata illeggibile: "latest"' },
    ])
  })
})
