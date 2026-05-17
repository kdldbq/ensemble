import type { EventAdapter } from '../adapters/identity'
import type { EnsembleEvent } from '../adapters/types'
import type { Database } from '../db/client'
import { auditLog } from '../db/schema'
import { logger } from '../logger'

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
    case 'workbook.opened':
    case 'workbook.deleted':
      return { type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at }
    case 'workbook.edited':
      return {
        type: input.type,
        workbookId: input.resourceId ?? '',
        userId: input.actorId,
        at,
        batchedOpsCount: (input.extra?.batchedOpsCount as number) ?? 0,
      }
    case 'workbook.moved':
      return {
        type: input.type,
        workbookId: input.resourceId ?? '',
        userId: input.actorId,
        fromFolderId: (input.extra?.fromFolderId as string | null | undefined) ?? null,
        toFolderId: (input.extra?.toFolderId as string | null | undefined) ?? null,
        at,
      }
    case 'folder.created':
    case 'folder.deleted':
    case 'folder.restored':
      return { type: input.type, folderId: input.resourceId ?? '', userId: input.actorId, at }
    case 'folder.renamed':
      return {
        type: input.type,
        folderId: input.resourceId ?? '',
        userId: input.actorId,
        newName: (input.extra?.newName as string) ?? '',
        at,
      }
    case 'folder.moved':
      return {
        type: input.type,
        folderId: input.resourceId ?? '',
        userId: input.actorId,
        fromParentId: (input.extra?.fromParentId as string | null | undefined) ?? null,
        toParentId: (input.extra?.toParentId as string | null | undefined) ?? null,
        at,
      }
    case 'share.granted':
      return { type: input.type, grantId: input.resourceId ?? '', grantedBy: input.actorId, at }
    case 'share.revoked':
      return { type: input.type, grantId: input.resourceId ?? '', revokedBy: input.actorId, at }
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
          logger.warn({ err, eventType: input.type }, 'EventAdapter.publish failed')
        }),
      ])
    },
  }
}

export type EventEmitter = ReturnType<typeof createEventEmitter>
