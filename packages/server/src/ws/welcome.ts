import type { WSContext } from '@hono/node-ws'
import type { AppDeps } from '../http/app'
import { createSnapshotService } from '../services/snapshot-service'
import { createWorkbookService } from '../services/workbook-service'

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
  const snapshotJson = snap ? new TextDecoder().decode(await deps.storage.get(snap.storageKey)) : null
  ws.send(
    JSON.stringify({
      type: 'welcome',
      workbookId: wb.id,
      seqNum: 0,
      snapshot: snapshotJson ? JSON.parse(snapshotJson) : null,
      presence: [],
      locks: [],
    })
  )
}
