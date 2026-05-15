import type { WSContext } from 'hono/ws'
import type { AppDeps } from '../http/app'
import { createSnapshotService } from '../services/snapshot-service'
import { createWorkbookService } from '../services/workbook-service'
import { applyMaskRules } from '../services/mask-service'

export async function sendWelcome(
  ws: WSContext,
  deps: AppDeps,
  ctx: { tenantId: string; userId: string; workbookId: string }
) {
  const wb = await createWorkbookService(deps.db).get({ tenantId: ctx.tenantId, id: ctx.workbookId })
  if (!wb) {
    ws.send(JSON.stringify({ type: 'error', code: 'not_found' }))
    ws.close()
    return
  }
  const snap = await createSnapshotService(deps.db, deps.storage).getLatest(wb.id)
  let snapshotData: unknown = null
  if (snap) {
    const rawJson = new TextDecoder().decode(await deps.storage.get(snap.storageKey))
    const identity = { tenantId: ctx.tenantId, userId: ctx.userId }
    const rules = await deps.permission.getMaskRules(identity, { type: 'workbook', id: wb.id, tenantId: ctx.tenantId })
    const parsed = JSON.parse(rawJson) as Parameters<typeof applyMaskRules>[0]
    snapshotData = rules.length === 0 ? parsed : applyMaskRules(parsed, rules)
  }
  ws.send(
    JSON.stringify({
      type: 'welcome',
      workbookId: wb.id,
      seqNum: 0,
      snapshot: snapshotData,
      presence: [],
      locks: [],
    })
  )
}
