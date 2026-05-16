import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    // jsdom doesn't ship Path2D / OffscreenCanvas, but Univer 0.22 drawing plugins
    // touch them at module load time. Stub before tests so import-side-effects don't
    // crash. createEditor tests use _editorFactory and never exercise the real
    // canvas pipeline anyway.
    setupFiles: ['./test/setup-canvas-shims.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/univer-wrapper.ts', 'src/index.ts', 'src/types.ts'],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
  },
})
