import { expect, test } from '@playwright/test'

// Two browser contexts load the demo page.  pageA acts as 'admin', pageB as
// 'viewer' — deliberately different userIds so the Redis NX lock is truly
// contested between two distinct owners.  Only one acquire_lock can win.
test('two contexts: only one wins the same-cell lock', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await pageA.goto('/'); await pageA.evaluate(() => localStorage.clear())
  await pageB.goto('/'); await pageB.evaluate(() => localStorage.clear())

  // Wait for pageA to create/load the shared workbook and for the WS helper to bind
  await pageA.waitForFunction(
    () => typeof (window as { ensembleAcquireLock_admin?: unknown }).ensembleAcquireLock_admin === 'function',
    { timeout: 30_000 },
  )
  const wbId = (await pageA.evaluate(() => localStorage.getItem('wbId-shared')))!
  expect(wbId).toBeTruthy()

  // Point pageB at the same workbook and wait for its helper (viewer pane)
  await pageB.evaluate((id) => localStorage.setItem('wbId-shared', id), wbId)
  await pageB.reload()
  await pageB.waitForFunction(
    () => typeof (window as { ensembleAcquireLock_viewer?: unknown }).ensembleAcquireLock_viewer === 'function',
    { timeout: 30_000 },
  )

  // Both contexts race to acquire the same region simultaneously
  const [a, b] = await Promise.all([
    pageA.evaluate(() =>
      (window as unknown as { ensembleAcquireLock_admin: (r: string) => Promise<{ acquired: boolean; ownerId: string }> })
        .ensembleAcquireLock_admin('A1:A1')
    ),
    pageB.evaluate(() =>
      (window as unknown as { ensembleAcquireLock_viewer: (r: string) => Promise<{ acquired: boolean; ownerId: string }> })
        .ensembleAcquireLock_viewer('A1:A1')
    ),
  ])
  // Redis SET NX guarantees exactly one winner
  expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1)
  await ctxA.close(); await ctxB.close()
})
