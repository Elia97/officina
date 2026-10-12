#!/usr/bin/env node
// actions/ci/action.yml appende lo stdout a $GITHUB_OUTPUT: lì va solo `docs-only=…`, la ragione va su stderr.

import process from 'node:process'

import { ciScope } from '../lib/ci-scope.ts'
import { changedSince, eventBase } from '../lib/git.ts'

export function main(): number {
  const { docsOnly, reason } = ciScope(eventBase(), changedSince)
  console.error(reason)
  console.log(`docs-only=${docsOnly}`)
  return 0
}

if (import.meta.main) process.exit(main())
