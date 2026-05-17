import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Env overrides let the v0.1 capability-audit Playwright spec spin up an
// isolated server/web pair on 5311/5312 without disturbing a running 5301/5302
// dev session. Defaults match the documented dev workflow.
const PORT = Number(process.env.VITE_DEV_PORT ?? 5302)
const API_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:5301'

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true, ws: true },
    },
  },
})
