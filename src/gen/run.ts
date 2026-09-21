import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { missingInput } from '../lib/cli.ts'
import { generatorsSetting, loadConfig } from '../lib/config.ts'
import { PROJECT_GENERATORS } from './plopfile.mjs'

// plop risolve i template dalla cartella del plopfile e scrive in `--dest`: il plopfile sta nel
// pacchetto, la destinazione è il progetto da cui si lancia il comando.
export function plopCommand(args: string[], cwd: string): string[] {
  const require = createRequire(import.meta.url)
  const plopBin = join(dirname(require.resolve('plop/package.json')), 'bin', 'plop.js')
  const plopfile = fileURLToPath(new URL('./plopfile.mjs', import.meta.url))
  return [plopBin, '--plopfile', plopfile, '--dest', cwd, ...args]
}

export async function main(args: string[] = []): Promise<number> {
  const setting = generatorsSetting(await loadConfig(process.cwd()))
  if (setting === false) {
    console.error(
      '\n✗ Il progetto ha spento i generatori con `features.generators: false`: quelli del pacchetto\n' +
        '  scriverebbero codice che qui non si incastra.\n',
    )
    return 1
  }
  if (setting === 'project' && missingInput(PROJECT_GENERATORS, "con `generators: 'project'` i generatori sono i suoi"))
    return 1

  const env = setting === 'project' ? { ...process.env, OFFICINA_GENERATORS: 'project' } : process.env
  const result = spawnSync(process.execPath, plopCommand(args, process.cwd()), { stdio: 'inherit', env })
  return result.status ?? 1
}
