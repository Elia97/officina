#!/usr/bin/env node
// actions/ci/action.yml appende lo stdout a $GITHUB_OUTPUT: lì vanno solo `docs-only=…`, `release-only=…` e `gate=…`, la ragione va su stderr.

import process from 'node:process'

import { gateScope, gateSources } from '../lib/ci-gate.ts'
import { ciScope } from '../lib/ci-scope.ts'
import { changedSince, eventBase, fileAt } from '../lib/git.ts'

export function main(): number {
  const scope = ciScope(eventBase(), changedSince, fileAt)
  const { path, reason } = scope.path === 'full' ? gateScope(scope, gateSources()) : scope
  console.error(reason)
  console.log(`docs-only=${path === 'docs'}`)
  console.log(`release-only=${path === 'release'}`)
  console.log(`gate=${path === 'gate'}`)
  return 0
}

if (import.meta.main) process.exit(main())
