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
      include: ['src/lib/**/*.ts'],
    },
  },
})
