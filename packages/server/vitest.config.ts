import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
    setupFiles: ['./test/integration/_setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
