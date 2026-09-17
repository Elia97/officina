import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { changedFiles, trackedAndUntracked } from './git.ts'

const sha = (ref: string) => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim()

const tempDirs: string[] = []
const startDir = process.cwd()

afterEach(() => {
  process.chdir(startDir)
  vi.unstubAllEnvs()
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// Senza remote, il fetch di ripiego di ensureCommit fallisce subito e senza toccare la rete.
const tempRepo = (commitCount: number): string => {
  const dir = mkdtempSync(join(tmpdir(), 'repo-'))
  tempDirs.push(dir)
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir })
  git('init', '--initial-branch=main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  for (let n = 1; n <= commitCount; n += 1) {
    writeFileSync(join(dir, `file-${n}.txt`), 'content\n')
    git('add', '.')
    git('commit', '-m', `chore: commit ${n}`)
  }
  return dir
}

// Scrive l'evento che GitHub Actions passa al job: è l'unico modo di percorrere il ramo delle
// pull request, che in locale non si attiva mai.
const pullRequestEvent = (base: string, head: string): string => {
  const dir = mkdtempSync(join(tmpdir(), 'event-'))
  tempDirs.push(dir)
  const file = join(dir, 'event.json')
  writeFileSync(
    file,
    JSON.stringify({
      pull_request: { base: { sha: base }, head: { sha: head } },
    }),
  )
  return file
}

describe('trackedAndUntracked', () => {
  it('elenca i file del repository con i percorsi che esistono davvero', () => {
    const files = trackedAndUntracked()
    expect(files).toContain('package.json')
    expect(files).toContain('src/lib/git.ts')
  })
})

describe('changedFiles', () => {
  let repo: string

  beforeEach(() => {
    repo = tempRepo(3)
    process.chdir(repo)
  })

  it('con una base esplicita guarda il diff da lì a HEAD', () => {
    expect(changedFiles({ base: 'HEAD~1', head: 'HEAD' })).toEqual(['file-3.txt'])
  })

  it('senza head include anche le modifiche non ancora committate', () => {
    writeFileSync(join(repo, 'uncommitted.txt'), 'content\n')

    expect(changedFiles({ base: 'HEAD~1', head: 'HEAD' })).not.toContain('uncommitted.txt')
    expect(changedFiles({ base: 'HEAD~1' })).toContain('uncommitted.txt')
  })

  it('non ripete un file che risulta cambiato da più elenchi', () => {
    writeFileSync(join(repo, 'file-3.txt'), 'modified\n')

    expect(changedFiles({ base: 'HEAD~1' })).toEqual(['file-3.txt'])
  })

  // Senza remote il fetch di ripiego fallisce, ed è il caso che porta a galla il messaggio di
  // git invece di un errore generico: senza, chi legge non sa che il ref non esiste.
  it("riporta l'errore di git quando il riferimento non esiste", () => {
    expect(() => changedFiles({ base: 'ref-that-exists-nowhere' })).toThrow()
  })
})

describe('changedFiles sulle pull request', () => {
  beforeEach(() => {
    process.chdir(tempRepo(3))
  })

  it("usa gli sha dell'evento, non i branch locali", () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request')
    vi.stubEnv('GITHUB_EVENT_PATH', pullRequestEvent(sha('HEAD~2'), sha('HEAD')))

    expect(changedFiles({})).toEqual(['file-2.txt', 'file-3.txt'])
  })

  it("una base esplicita ha la precedenza sugli sha dell'evento", () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request')
    vi.stubEnv('GITHUB_EVENT_PATH', pullRequestEvent(sha('HEAD~2'), sha('HEAD')))

    expect(changedFiles({ base: 'HEAD~1', head: 'HEAD' })).toEqual(['file-3.txt'])
  })

  it('ignora un evento che non descrive una pull request', () => {
    vi.stubEnv('GITHUB_EVENT_NAME', 'push')
    vi.stubEnv('GITHUB_EVENT_PATH', pullRequestEvent(sha('HEAD~1'), sha('HEAD')))

    expect(() => changedFiles({})).not.toThrow()
  })

  it('ignora un evento privo degli sha', () => {
    const eventDir = mkdtempSync(join(tmpdir(), 'event-'))
    tempDirs.push(eventDir)
    const file = join(eventDir, 'event.json')
    writeFileSync(file, JSON.stringify({ pull_request: { base: {} } }))

    vi.stubEnv('GITHUB_EVENT_NAME', 'pull_request')
    vi.stubEnv('GITHUB_EVENT_PATH', file)

    expect(() => changedFiles({})).not.toThrow()
  })
})

describe('defaultBase', () => {
  it('parte da origin/HEAD quando il clone lo dichiara', () => {
    const repo = tempRepo(2)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo })
    git('update-ref', 'refs/remotes/origin/main', 'HEAD~1')
    git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main')
    process.chdir(repo)

    expect(changedFiles({})).toEqual(['file-2.txt'])
  })

  it('senza origin/HEAD ricade sul primo candidato che esiste', () => {
    process.chdir(tempRepo(1))

    expect(() => changedFiles({})).not.toThrow()
  })

  it('senza nessun candidato dice quale opzione passare', () => {
    process.chdir(tempRepo(0))

    expect(() => changedFiles({})).toThrow(/--base/)
  })

  // Due radici scorrelate: i due commit esistono entrambi, quindi ensureCommit passa ed è il
  // diff a fallire — lo stesso esito di un clone shallow, che è il caso che il messaggio nomina.
  it('su due storie senza antenato comune suggerisce il clone completo', () => {
    const repo = tempRepo(1)
    process.chdir(repo)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
    git('checkout', '--orphan', 'other-root')
    writeFileSync(join(repo, 'other.txt'), 'other\n')
    git('add', '.')
    git('commit', '-m', 'chore: unrelated root')

    expect(() => changedFiles({ base: 'main', head: 'other-root' })).toThrow(/unshallow/)
  })
})
