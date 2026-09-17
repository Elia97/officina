// `pnpm run check` è un `biome check --write .` su tutto il repo, quindi riformatta anche file sporchi
// che non c'entrano: i suggerimenti di recupero non devono mai ricorrere a un `git checkout` di file intero.
import { execSync } from 'node:child_process'

export function postGenAction(root, recoveryHint) {
  return () => {
    try {
      execSync('pnpm exec astro sync', { cwd: root, stdio: 'inherit' })
      execSync('pnpm run check', { cwd: root, stdio: 'inherit' })
    } catch (error) {
      throw new Error(
        `Post-generation checks failed. ${
          recoveryHint ??
          'The generated files were left on disk — inspect, then fix or delete them before re-running (a re-run against leftovers fails with "File already exists").'
        }`,
        { cause: error },
      )
    }
    return 'astro sync + biome check passed'
  }
}
