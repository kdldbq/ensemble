import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('admin sees raw value, viewer sees mask', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('code').filter({ hasText: 'admin' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('code').filter({ hasText: 'viewer' })).toBeVisible()
  await page.waitForFunction(() => !!localStorage.getItem('wbId-shared'), { timeout: 30_000 })
  const wbId = await page.evaluate(() => localStorage.getItem('wbId-shared'))
  expect(wbId).toBeTruthy()

  await page.evaluate(async (wb) => {
    const payload = {
      id: wb,
      sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1',
          name: 'Grades',
          cellData: {
            '0': { '0': { v: 'name' }, '1': { v: 'score' } },
            '1': { '0': { v: 'Alice' }, '1': { v: 90 } },
          },
        },
      },
    }
    const res = await fetch(`/api/v1/workbooks/${wb}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:admin', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })
    if (!res.ok) throw new Error('save failed')
  }, wbId)

  const adminValue = await page.evaluate(async (wb) => {
    const r = await fetch(`/api/v1/workbooks/${wb}/snapshot`, {
      headers: { Authorization: 'Bearer dev:admin' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['1']?.['1']?.v
  }, wbId)
  expect(adminValue).toBe(90)

  const viewerValue = await page.evaluate(async (wb) => {
    const r = await fetch(`/api/v1/workbooks/${wb}/snapshot`, {
      headers: { Authorization: 'Bearer dev:viewer' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['1']?.['1']?.v
  }, wbId)
  expect(viewerValue).toBe('***')
})
