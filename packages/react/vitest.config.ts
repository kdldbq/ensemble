import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@ensemble-sheets/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: { environment: 'jsdom', globals: true },
})
