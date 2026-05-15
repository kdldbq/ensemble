import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/univer-wrapper.ts', // dynamic require() for browser-only UI plugins; covered by T23 Playwright
        'src/index.ts',          // barrel re-exports only, no runtime logic
        'src/types.ts',          // pure type declarations, no runtime code
      ],
      // branches: 78 — 3 browser-only branches in mount.ts (_editorFactory ?? and _wsConnect else)
      // are untestable in jsdom; covered by T23 Playwright e2e. All other thresholds remain strict.
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 78 },
    },
  },
})
