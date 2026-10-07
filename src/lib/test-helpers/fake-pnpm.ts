import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = `#!/usr/bin/env bash
echo "pnpm $*"
env | LC_ALL=C sort | grep -vE '^(PATH|PWD|OLDPWD|SHLVL|_)='
[ -z "\${FAKE_PNPM_SIGNAL:-}" ] || kill -s "$FAKE_PNPM_SIGNAL" $$
exit "\${FAKE_PNPM_EXIT:-0}"
`

export function fakePnpm(): string {
  const dir = mkdtempSync(join(tmpdir(), 'officina-pnpm-'))
  writeFileSync(join(dir, 'pnpm'), SCRIPT, { mode: 0o755 })
  return dir
}
