#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import process from 'node:process'

import {
  cleanOutput,
  duration,
  failureReport,
  type GatePlan,
  gateSteps,
  header,
  logName,
  type Step,
  stepLine,
} from '../lib/gate.ts'

const LOG_DIR = 'node_modules/.cache/officina/gate'

type Outcome = { code: number; output: string; ms: number }

function runStep(step: Step, env: NodeJS.ProcessEnv): Promise<Outcome> {
  const started = performance.now()
  return new Promise((done) => {
    const chunks: Buffer[] = []
    const child = spawn(step.command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], env })
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => chunks.push(chunk))
    const finish = (code: number, note = '') =>
      done({ code, output: Buffer.concat(chunks).toString('utf8') + note, ms: performance.now() - started })
    child.on('error', (error) => finish(1, `\n${error.message}\n`))
    child.on('close', (code, signal) => finish(code ?? 1, signal === null ? '' : `\nfermato da ${signal}\n`))
  })
}

function loadPlan(): GatePlan | string {
  let scripts: Record<string, string>
  try {
    scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {}
  } catch {
    return '`package.json` non si legge nella cartella corrente, che deve essere la radice del progetto'
  }
  const plan = gateSteps(scripts)
  return 'error' in plan ? plan.error : plan
}

async function runAll(plan: GatePlan): Promise<number> {
  const env = { ...process.env, PATH: [resolve('node_modules/.bin'), process.env.PATH].join(delimiter) }
  const width = Math.max(...plan.steps.map((step) => step.name.length))
  const live = process.stdout.isTTY === true
  for (const [index, step] of plan.steps.entries()) {
    if (live) process.stdout.write(`  … ${step.name}`)
    const outcome = await runStep(step, env)
    const log = join(LOG_DIR, logName(index, step))
    writeFileSync(log, cleanOutput(outcome.output))
    if (live) process.stdout.write('\r\x1b[K')
    console.log(stepLine(step.name, outcome.code === 0, outcome.ms, width))
    if (outcome.code !== 0) {
      console.log(`${failureReport(step, outcome.output, plan.steps.length - index - 1, log).join('\n')}\n`)
      return outcome.code
    }
  }
  return 0
}

export async function main(): Promise<number> {
  const plan = loadPlan()
  if (typeof plan === 'string') {
    console.error(`\n✗ gate — ${plan}.\n`)
    return 1
  }
  rmSync(LOG_DIR, { recursive: true, force: true })
  mkdirSync(LOG_DIR, { recursive: true })
  console.log(`\n${header(plan)}\n`)
  const started = performance.now()
  const code = await runAll(plan)
  if (code === 0) console.log(`\n  Verde in ${duration(performance.now() - started)}.\n`)
  return code
}

if (import.meta.main) process.exit(await main())
