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
        // CLI entry — exercised by migrate.int.test.ts via child_process.spawn,
        // which v8 cannot instrument in the parent process.
        'src/db/migrate.ts',
      ],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
    globalSetup: ['./test/integration/_globalSetup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
