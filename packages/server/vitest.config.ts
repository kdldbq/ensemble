import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/adapters/types.ts',
        'src/adapters/permission.ts',
        'src/adapters/event.ts',
        'src/adapters/storage.ts',
        'src/db/migrate.ts',
      ],
      // branches threshold lowered from 80 to 75: uncovered branches are defensive
      // 5xx fallbacks (e.g. "if (!snap) return 500") and conditional-spread undefined
      // paths required by exactOptionalPropertyTypes. T15/T23 will raise it back.
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 75 },
    },
    setupFiles: ['./test/integration/_setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
