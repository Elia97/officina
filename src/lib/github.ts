import { spawnSync } from 'node:child_process'

// `{owner}/{repo}` nel percorso lo risolve gh dal remote del repository nella cartella corrente.
export function ghApi(args: string[]): string {
  const result = spawnSync('gh', ['api', ...args], { encoding: 'utf8' })
  if (result.error !== undefined) throw new Error(`gh non si lancia: ${result.error.message}`)
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `gh api ${args.join(' ')} è uscito con ${result.status}`)
  return result.stdout
}
