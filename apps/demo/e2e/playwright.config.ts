import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  testDir: '.',
  use: { baseURL: 'http://localhost:5302', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev:server',
      port: 5301,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:5302',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  timeout: 60_000,
})
