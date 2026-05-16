import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@ensemble-sheets/core': path.resolve(__dirname, '../core/src/index.ts'),
    },
  },
  test: { environment: 'jsdom' },
})
