import { stripVTControlCharacters } from 'node:util'

export type Step = { name: string; command: string }

export type GatePlan = { steps: Step[]; ciParts: number }

const MAX_EXCERPT_LINES = 60

const OTHER_SHELL_SYNTAX = /[|;&`]|\$\(/

const AFTER_CI = ['audit:diff', 'build']

const stepOf = (command: string): Step => ({ name: /^pnpm run (\S+)$/.exec(command)?.[1] ?? command, command })

const scriptStep = (name: string): Step => ({ name, command: `pnpm run ${name}` })

export function gateSteps(scripts: Readonly<Record<string, string>>): GatePlan | { error: string } {
  const ci = scripts.ci
  if (ci === undefined) return { error: '`package.json` non ha lo script `ci`' }
  const parts = ci.split('&&').map((part) => part.trim())
  const ciSteps = OTHER_SHELL_SYNTAX.test(parts.join(' ')) ? [scriptStep('ci')] : parts.map(stepOf)
  const after = AFTER_CI.filter((name) => scripts[name] !== undefined).map(scriptStep)
  return { steps: [...ciSteps, ...after], ciParts: ciSteps.length }
}

export const cleanOutput = (text: string): string =>
  stripVTControlCharacters(text)
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n')

// pnpm apre l'output di `pnpm run` con la riga `$ <comando>`, che ripete il nome del passo, e su un
// errore lo chiude con `[ELIFECYCLE] Command failed with exit code N`, che ripete il rosso.
export function excerpt(text: string, max = MAX_EXCERPT_LINES): { lines: string[]; hidden: number } {
  const all = cleanOutput(text)
    .split('\n')
    .filter((line) => !line.startsWith('[ELIFECYCLE] '))
  const start = all.findIndex((line) => line !== '' && !line.startsWith('$ '))
  const kept = (start === -1 ? [] : all.slice(start)).filter((line, i, lines) => line !== '' || lines[i - 1] !== '')
  while (kept.at(-1) === '') kept.pop()
  return { lines: kept.slice(0, max), hidden: Math.max(0, kept.length - max) }
}

export function duration(ms: number): string {
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1).replace('.', ',')} s`
  const whole = Math.round(seconds)
  return `${Math.floor(whole / 60)} min ${whole % 60} s`
}

export function header({ steps, ciParts }: GatePlan): string {
  const ci = ciParts === 1 && steps[0]?.name === 'ci' ? ['ci'] : [`i ${ciParts} di ci`]
  const names = [...ci, ...steps.slice(ciParts).map((step) => step.name)]
  return `officina gate — ${steps.length} passi: ${names.join(', ')}`
}

export const stepLine = (name: string, ok: boolean, ms: number, width: number): string =>
  `  ${ok ? '✓' : '✗'} ${name.padEnd(width)}  ${duration(ms).padStart(9)}`

const notRun = (count: number): string => (count === 1 ? '1 passo non lanciato' : `${count} passi non lanciati`)

export function failureReport(step: Step, output: string, skipped: number, logPath: string): string[] {
  const { lines, hidden } = excerpt(output)
  const body = lines.length === 0 ? ['(nessun output)'] : lines
  return [
    '',
    ...body.map((line) => (line === '' ? '' : `  ${line}`)),
    ...(hidden > 0 ? [`  … altre ${hidden} righe nel log`] : []),
    '',
    ...(skipped > 0 ? [`  Fermo su ${step.name}: ${notRun(skipped)}.`] : []),
    `  Log completo: ${logPath}`,
  ]
}

export const logName = (index: number, step: Step): string =>
  `${String(index + 1).padStart(2, '0')}-${step.name.replace(/[^\w.-]+/g, '_').slice(0, 40)}.log`
