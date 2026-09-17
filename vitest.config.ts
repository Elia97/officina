import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts'],
    // Il gate CRAP di fallow legge coverage/coverage-final.json, che scrive il reporter `json`.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json'],
      include: ['src/bin.ts', 'src/lib/**/*.ts', 'src/gen/**/*.mjs'],
      // Ogni buco voluto porta un `v8 ignore` con la sua ragione: sotto il 100% il gate si ferma.
      thresholds: { 100: true },
    },
  },
})
