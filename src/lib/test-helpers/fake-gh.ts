import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { vi } from 'vitest'

const SCRIPT = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_GH_LOG"
case "$2" in
  */git/commits/*) echo "\${FAKE_GH_TREE:-}" ;;
  */status) echo "\${FAKE_GH_STATUS:-}" ;;
esac
[ -z "\${FAKE_GH_STDERR:-}" ] || echo "$FAKE_GH_STDERR" >&2
exit "\${FAKE_GH_EXIT:-0}"
`

const dirs: string[] = []

export function useFakeGh(env: Record<string, string> = {}): () => string[] {
  const dir = mkdtempSync(join(tmpdir(), 'officina-gh-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'gh'), SCRIPT, { mode: 0o755 })
  const log = join(dir, 'calls.log')
  writeFileSync(log, '')
  vi.stubEnv('PATH', `${dir}:${process.env.PATH}`)
  vi.stubEnv('FAKE_GH_LOG', log)
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return () => readFileSync(log, 'utf8').split('\n').filter(Boolean)
}

export function cleanFakeGh(): void {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}
