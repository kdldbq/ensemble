import { defineConfig, devices } from '@playwright/test'

/**
 * Standalone Playwright config for the v0.1 capability audit.
 *
 * Runs server on :5311 and Vite on :5312 — purposefully different from the
 * default dev ports (5301 / 5302) so a developer with a running dev session can
 * run this audit without killing their server.
 *
 * Postgres + Redis are reused from the docker-compose dev stack (5303 / 5304).
 *
 * Invoke with:
 *   pnpm --filter @ensemble-sheets/demo exec playwright test \
 *     --config e2e/playwright.audit.config.ts
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'v01-capability-audit.spec.ts',
  use: { baseURL: 'http://localhost:5312', headless: true, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'cd .. && PORT=5311 DATABASE_URL=postgres://postgres:postgres@localhost:5303/ensemble_dev REDIS_URL=redis://localhost:5304 tsx src/server-runner.ts',
      port: 5311,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'cd .. && VITE_DEV_PORT=5312 VITE_API_PROXY_TARGET=http://localhost:5311 pnpm exec vite',
      url: 'http://localhost:5312',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  timeout: 90_000,
})
