import { type Hit, readLines } from './cli.ts'

/** Un file che porta il pin di un pacchetto scaricato al volo, e il suo contenuto. */
export interface PinSite {
  path: string
  source: string
}

export interface PinHit extends Hit {
  path: string
}

type Pin = { path: string; line: number; version: string }

const EXACT = /^\d+\.\d+\.\d+$/
const escaped = (name: string) => name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

function pinsOf(pkg: string, sites: readonly PinSite[]): Pin[] {
  const pattern = new RegExp(`(?<![\\w@/.-])${escaped(pkg)}@([\\w.-]+)`)
  return sites.flatMap(({ path, source }) =>
    readLines(source).flatMap(({ n, text }) => {
      const version = pattern.exec(text)?.[1]
      return version === undefined ? [] : [{ path, line: n, version }]
    }),
  )
}

const major = (version: string): number => Number(/^(\d+)\./.exec(version)?.[1])

// Il pin esatto è il contratto: `vercel@59` ridà una CLI diversa ogni settimana, e un deploy che
// fallisce non si riproduce. La major più nuova su npm resta una segnalazione, non un obbligo.
export function pinFindings(pkg: string, latest: string, sites: readonly [PinSite, ...PinSite[]]): PinHit[] {
  const pins = pinsOf(pkg, sites)
  const home = sites[0].path
  if (pins.length === 0) {
    return [{ path: home, line: 1, message: `nessun \`${pkg}@<x.y.z>\`: il pin è sparito` }]
  }

  const loose = pins.filter(({ version }) => !EXACT.test(version))
  if (loose.length > 0) {
    return loose.map(({ path, line, version }) => ({
      path,
      line,
      message: `${pkg}@${version}: il pin va scritto per intero, \`x.y.z\``,
    }))
  }

  const versions = [...new Set(pins.map(({ version }) => version))].sort()
  const [pinned = ''] = versions
  if (versions.length > 1) {
    return pins.map(({ path, line, version }) => ({
      path,
      line,
      message: `${pkg}@${version}: il pin non è lo stesso ovunque (${versions.join(', ')})`,
    }))
  }

  const published = major(latest)
  if (Number.isNaN(published)) {
    return [{ path: home, line: 1, message: `versione pubblicata illeggibile: ${JSON.stringify(latest)}` }]
  }
  if (major(pinned) >= published) return []
  return pins.map(({ path, line }) => ({
    path,
    line,
    message: `${pkg}@${pinned}: su npm è pubblicata la major ${published}`,
  }))
}
