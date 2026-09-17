import { type Hit, readLines } from './cli.ts'

const PIN = /\bvercel@(\d+)\b/

type Pin = { line: number; major: number }

function pinnedVersions(workflow: string): Pin[] {
  return readLines(workflow).flatMap(({ n, text }) => {
    const major = Number(PIN.exec(text)?.[1])
    return Number.isNaN(major) ? [] : [{ line: n, major }]
  })
}

function publishedMajor(version: string): number {
  return Number(/^\s*(\d+)\./.exec(version)?.[1])
}

export function pinFindings(workflow: string, latest: string): Hit[] {
  const pins = pinnedVersions(workflow)
  if (pins.length === 0) return [{ line: 1, message: 'nessun `vercel@<major>`: il pin è sparito dal workflow' }]

  const majors = [...new Set(pins.map(({ major }) => major))].sort((a, b) => a - b)
  if (majors.length > 1)
    return pins.map(({ line, major }) => ({
      line,
      message: `vercel@${major}: il workflow porta major diverse (${majors.join(', ')})`,
    }))

  const published = publishedMajor(latest)
  if (Number.isNaN(published))
    return [{ line: 1, message: `versione pubblicata illeggibile: ${JSON.stringify(latest)}` }]

  const pinned = Math.max(...pins.map(({ major }) => major))
  if (pinned >= published) return []
  return pins.map(({ line }) => ({ line, message: `vercel@${pinned}: su npm è pubblicata la major ${published}` }))
}
