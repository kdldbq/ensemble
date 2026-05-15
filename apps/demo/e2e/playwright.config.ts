import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev:server',
      port: 3000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  timeout: 60_000,
})
