import { expect, test } from '@playwright/test'

/**
 * M1.6 — visual regression smoke pack.
 *
 * Run with `pnpm playwright test visual.spec.ts --update-snapshots` after an
 * intentional UI change.
 */

test.use({
  viewport: { width: 1280, height: 800 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
})

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fixed = new Date('2026-05-17T00:00:00+08:00').getTime()
    Date.now = () => fixed
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test('login page baseline', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('login.png', {
    maxDiffPixelRatio: 0.005,
    fullPage: true,
  })
})

test('demo shell after sign-in', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveScreenshot('shell.png', {
    maxDiffPixelRatio: 0.01,
    fullPage: true,
  })
})

test('folder drawer empty state', async ({ page }) => {
  await page.goto('/?demo=1')
  await page.waitForLoadState('networkidle')
  const btn = page.getByRole('button', { name: /文件夹|Folders/i })
  if (await btn.count()) {
    await btn.first().click()
    await page.waitForTimeout(150)
    const drawer = page.getByRole('dialog')
    if (await drawer.count()) {
      await expect(drawer.first()).toHaveScreenshot('folder-drawer.png', {
        maxDiffPixelRatio: 0.01,
      })
    }
  }
})
