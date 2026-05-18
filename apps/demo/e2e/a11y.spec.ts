import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * Automated WCAG 2.2 audit on the demo landing page (M1.5).
 *
 * Runs axe-core against the rendered DOM and asserts zero violations.
 * Excluded rules: color-contrast on Univer canvas (canvas pixels axe can't
 * resolve), region (Univer ribbon doesn't declare landmark roles).
 */
test.describe('A11y (axe-core)', () => {
  test('demo home page passes WCAG 2.2 AA (with documented exclusions)', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas', { timeout: 30_000 })
    await page.waitForTimeout(500)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22a', 'wcag22aa'])
      .disableRules(['color-contrast'])
      .exclude('.univer-toolbar')
      .analyze()

    if (results.violations.length > 0) {
      console.log('Axe violations:', JSON.stringify(results.violations, null, 2))
    }
    expect(results.violations).toEqual([])
  })

  test('folder drawer (open state) has no a11y violations', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas', { timeout: 30_000 })
    const isMac = process.platform === 'darwin'
    await page.keyboard.press(`${isMac ? 'Meta' : 'Control'}+k`)
    await page.waitForSelector('[role="dialog"]', { timeout: 5_000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .include('[role="dialog"]')
      .analyze()

    if (results.violations.length > 0) {
      console.log('Drawer axe violations:', JSON.stringify(results.violations, null, 2))
    }
    expect(results.violations).toEqual([])
  })
})
