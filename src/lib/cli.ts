import { existsSync } from 'node:fs'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { changedFiles, trackedAndUntracked } from './git.ts'

// Un ritrovamento prima di sapere in quale file sta: i gate lo producono riga per riga, e
// scopedPaths lo completa in Finding aggiungendo percorso e gravità.
export interface Hit {
  line: number
  message: string
}

export type Finding = {
  path: string
  line?: number
  message: string
  severity: 'error' | 'warning'
}

export function cliOptions(args: string[] = process.argv.slice(2)) {
  const { GITHUB_ACTIONS } = process.env
  const { values } = parseArgs({
    args,
    options: {
      diff: { type: 'boolean', default: false },
      base: { type: 'string' },
      head: { type: 'string' },
      strict: { type: 'boolean', default: false },
      format: {
        type: 'string',
        default: GITHUB_ACTIONS ? 'github' : 'text',
      },
    },
  })
  return { ...values, diff: values.diff || values.base !== undefined }
}

export type CliOptions = ReturnType<typeof cliOptions>

// Un file generato non lo scrive nessuno, e il suo banner chiede di tenerlo fuori da linter e
// formatter: una correzione ai suoi commenti sparirebbe alla prima rigenerazione.
export const isGenerated = (path: string): boolean => /\.gen\.[cm]?tsx?$/.test(path)

export function missingInput(path: string, purpose: string): boolean {
  if (existsSync(path)) return false
  console.error(`\n✗ ${path} non c'è: ${purpose}.\n`)
  return true
}

export function scopedPaths(options: CliOptions, isScanned: (path: string) => boolean): string[] {
  const candidates = options.diff ? changedFiles({ base: options.base, head: options.head }) : trackedAndUntracked()
  // ls-files elenca anche i file cancellati ma non ancora rimossi dall'indice.
  return candidates
    .filter((path) => isScanned(path) && !isGenerated(path))
    .filter(existsSync)
    .sort()
}

// I workflow command di GitHub vogliono %, CR e LF codificati nel messaggio.
const escapeForGitHub = (text: string) => text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

export function printFindings(findings: Finding[], format: string): void {
  for (const finding of findings) {
    const location = finding.line === undefined ? '' : `:${finding.line}`
    if (format === 'github') {
      const lineParam = finding.line === undefined ? '' : `,line=${finding.line}`
      console.log(`::${finding.severity} file=${finding.path}${lineParam}::${escapeForGitHub(finding.message)}`)
    } else {
      const mark = finding.severity === 'error' ? '✗' : '·'
      console.log(`  ${mark} ${finding.path}${location}: ${finding.message}`)
    }
  }
}

export function exitCode(findings: Finding[], strict: boolean): number {
  const hasErrors = findings.some((f) => f.severity === 'error')
  const hasWarnings = findings.some((f) => f.severity === 'warning')
  return hasErrors || (strict && hasWarnings) ? 1 : 0
}

export const readLines = (text: string) =>
  text
    .replace(/\r?\n$/, '')
    .split(/\r?\n/)
    .map((line, i) => ({ n: i + 1, text: line }))
