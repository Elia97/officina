#!/usr/bin/env node
// actions/ci/action.yml appende lo stdout a $GITHUB_OUTPUT: lì vanno solo `docs-only=…` e `release-only=…`, la ragione va su stderr.

import process from 'node:process'

import { ciScope } from '../lib/ci-scope.ts'
import { changedSince, eventBase, fileAt } from '../lib/git.ts'

export function main(): number {
  const { path, reason } = ciScope(eventBase(), changedSince, fileAt)
  console.error(reason)
  console.log(`docs-only=${path === 'docs'}`)
  console.log(`release-only=${path === 'release'}`)
  return 0
}

if (import.meta.main) process.exit(main())
