import type { WSContext } from 'hono/ws'
import type { AppDeps } from '../http/app'
import { createSnapshotService } from '../services/snapshot-service'
import { createWorkbookService } from '../services/workbook-service'
import { applyMaskRules, type WorkbookData } from '../services/mask-service'
import type { MutationService } from '../services/mutation-service'
import type { PresenceTracker } from '../realtime/presence-tracker'
import type { Redis } from '../redis/client'
import { scanLocks } from '../realtime/cell-lock-manager'

export interface WelcomeDeps extends AppDeps {
  mutations: MutationService
  presence: PresenceTracker
  redis: Redis
}

export interface WelcomeCtx {
  tenantId: string
  userId: string
  workbookId: string
  lastSeq?: number
}

function payloadLooksLikeWorkbookData(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    'sheetOrder' in (x as Record<string, unknown>) &&
    'sheets' in (x as Record<string, unknown>)
  )
}

export async function sendWelcome(
  ws: WSContext,
  deps: WelcomeDeps,
  ctx: WelcomeCtx
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

  // Determine current seqNum for the welcome frame
  const currentSeq = await deps.mutations.currentSeq(wb.id)

  const [presenceEntries, lockEntries] = await Promise.all([
    Promise.resolve(deps.presence.list(wb.id)),
    scanLocks(deps.redis, wb.id),
  ])

  ws.send(
    JSON.stringify({
      type: 'welcome',
      workbookId: wb.id,
      seqNum: currentSeq,
      snapshot: snapshotData,
      presence: presenceEntries,
      locks: lockEntries,
    })
  )

  // Replay path: if lastSeq was provided, send missed mutations
  if (ctx.lastSeq != null) {
    const gap = currentSeq - ctx.lastSeq
    if (gap > 200) {
      // Too far behind — client should treat welcome as a cold start
      ws.send(JSON.stringify({ type: 'replay_complete', seqNum: currentSeq }))
    } else {
      const rows = await deps.mutations.since(wb.id, ctx.lastSeq, 200)
      const identity = { tenantId: ctx.tenantId, userId: ctx.userId }
      for (const row of rows) {
        const rules = await deps.permission.getMaskRules(identity, {
          type: 'workbook',
          id: wb.id,
          tenantId: ctx.tenantId,
        })
        let outPayload = row.payload
        if (rules.length > 0 && payloadLooksLikeWorkbookData(row.payload)) {
          outPayload = applyMaskRules(row.payload as WorkbookData, rules)
        }
        ws.send(JSON.stringify({ type: 'apply_mutation', seqNum: Number(row.seqNum), userId: row.userId, payload: outPayload }))
      }
      ws.send(JSON.stringify({ type: 'replay_complete', seqNum: currentSeq }))
    }
  }
}
