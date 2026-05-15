import { expect, test } from '@playwright/test'

// FIXME (Sprint 4): demo server-runner ioredis 5 crashes on RESP parse error
// when sharing host Redis with other projects. Core 2-client collab is fully
// proven by packages/server/test/integration/collab-two-clients.int.test.ts
// using dedicated Testcontainers Redis. Sprint 4 should give the demo its own
// redis container in playwright.config webServer and harden the connection.
test.fixme('two contexts share state via REST reflection', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await pageA.goto('/')
  await pageA.evaluate(() => localStorage.clear())
  await pageB.goto('/')
  await pageB.evaluate(() => localStorage.clear())

  await pageA.waitForFunction(() => !!localStorage.getItem('wbId-shared'), { timeout: 30_000 })
  const wbId = (await pageA.evaluate(() => localStorage.getItem('wbId-shared')))!
  expect(wbId).toBeTruthy()

  await pageB.evaluate((id) => localStorage.setItem('wbId-shared', id), wbId)
  await pageB.reload()
  await expect(pageB.locator('.ensemble-workbook-root').first()).toBeVisible({ timeout: 30_000 })

  await pageA.evaluate(async (id) => {
    const payload = {
      id, sheetOrder: ['s1'],
      sheets: { s1: { id: 's1', name: 'S', cellData: { '0': { '0': { v: 42 } } } } },
    }
    const r = await fetch(`/api/v1/workbooks/${id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:admin', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })
    if (!r.ok) throw new Error('save failed')
  }, wbId)

  const v = await pageB.evaluate(async (id) => {
    const r = await fetch(`/api/v1/workbooks/${id}/snapshot`, {
      headers: { Authorization: 'Bearer dev:admin' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['0']?.['0']?.v
  }, wbId)
  expect(v).toBe(42)

  await ctxA.close(); await ctxB.close()
})
