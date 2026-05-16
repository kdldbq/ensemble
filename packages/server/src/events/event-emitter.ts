import type { Database } from '../db/client'
import { auditLog } from '../db/schema'
import type { EventAdapter, EnsembleEvent } from '../adapters/identity'

export interface EmitInput {
  tenantId: string
  actorId: string
  type: EnsembleEvent['type']
  resourceId?: string
  extra?: Record<string, unknown>
}

export interface EventEmitterDeps {
  db: Database
  eventAdapter: EventAdapter
}

function buildEvent(input: EmitInput, at: string): EnsembleEvent {
  switch (input.type) {
    case 'workbook.created':
      return { type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at }
    case 'workbook.opened':
      return { type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at }
    case 'workbook.edited':
      return {
        type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at,
        batchedOpsCount: (input.extra?.batchedOpsCount as number) ?? 0,
      }
    case 'folder.created':
      return { type: input.type, folderId: input.resourceId ?? '', userId: input.actorId, at }
    case 'share.granted':
      return { type: input.type, grantId: input.resourceId ?? '', grantedBy: input.actorId, at }
  }
}

export function createEventEmitter(deps: EventEmitterDeps) {
  return {
    async emit(input: EmitInput): Promise<void> {
      const at = new Date().toISOString()
      const ev = buildEvent(input, at)
      await Promise.all([
        deps.db.insert(auditLog).values({
          tenantId: input.tenantId,
          eventType: input.type,
          actorId: input.actorId,
          resourceId: input.resourceId ?? null,
          payload: input.extra ?? {},
        }),
        deps.eventAdapter.publish(ev).catch((err) => {
          console.warn(`EventAdapter.publish failed for ${input.type}:`, err)
        }),
      ])
    },
  }
}

export type EventEmitter = ReturnType<typeof createEventEmitter>
