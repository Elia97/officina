import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

// plop risolve i template dalla cartella del plopfile e scrive in `--dest`: il plopfile sta nel
// pacchetto, la destinazione è il progetto da cui si lancia il comando.
export function plopCommand(args: string[], cwd: string): string[] {
  const require = createRequire(import.meta.url)
  const plopBin = join(dirname(require.resolve('plop/package.json')), 'bin', 'plop.js')
  const plopfile = fileURLToPath(new URL('./plopfile.mjs', import.meta.url))
  return [plopBin, '--plopfile', plopfile, '--dest', cwd, ...args]
}

export function main(args: string[] = []): number {
  const result = spawnSync(process.execPath, plopCommand(args, process.cwd()), { stdio: 'inherit' })
  return result.status ?? 1
}
