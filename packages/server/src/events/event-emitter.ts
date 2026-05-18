import { createHash } from 'node:crypto'
import { desc, eq } from 'drizzle-orm'
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
    case 'protection.created':
      return {
        type: input.type,
        protectionId: input.resourceId ?? '',
        workbookId: (input.extra?.workbookId as string) ?? '',
        userId: input.actorId,
        rangeRef: (input.extra?.rangeRef as string) ?? '',
        at,
      }
    case 'protection.deleted':
      return {
        type: input.type,
        protectionId: input.resourceId ?? '',
        workbookId: (input.extra?.workbookId as string) ?? '',
        userId: input.actorId,
        at,
      }
    case 'comment.created':
    case 'comment.resolved':
    case 'comment.unresolved':
      return {
        type: input.type,
        commentId: input.resourceId ?? '',
        workbookId: (input.extra?.workbookId as string) ?? '',
        threadId: (input.extra?.threadId as string) ?? '',
        userId: input.actorId,
        at,
      }
    case 'comment.deleted':
      return {
        type: input.type,
        commentId: input.resourceId ?? '',
        workbookId: (input.extra?.workbookId as string) ?? '',
        userId: input.actorId,
        at,
      }
    case 'comment.mentioned':
      return {
        type: input.type,
        commentId: input.resourceId ?? '',
        workbookId: (input.extra?.workbookId as string) ?? '',
        mentioner: input.actorId,
        mentioned: (input.extra?.mentioned as string[]) ?? [],
        at,
      }
  }
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

function canonicalRow(row: {
  tenantId: string
  eventType: string
  actorId: string
  resourceId: string | null
  payload: Record<string, unknown>
  occurredAt: string
}): string {
  // Stable JSON: sort object keys recursively so canonical form is deterministic.
  const sortKeys = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v
    if (Array.isArray(v)) return v.map(sortKeys)
    const obj = v as Record<string, unknown>
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k])
        return acc
      }, {})
  }
  return [
    row.tenantId,
    row.eventType,
    row.actorId,
    row.resourceId ?? '',
    JSON.stringify(sortKeys(row.payload)),
    row.occurredAt,
  ].join('|')
}

export function createEventEmitter(deps: EventEmitterDeps) {
  // Serialize per-tenant inserts so chain_hash is deterministic and gap-free.
  // Map<tenantId, Promise> — each new emit chains onto the previous one,
  // forming a queue. Cleaned implicitly when promises resolve.
  const tenantQueues = new Map<string, Promise<unknown>>()

  async function appendChained(input: EmitInput, occurredIso: string): Promise<void> {
    // Look up the latest row's chain_hash for this tenant (genesis = '').
    const prev = await deps.db
      .select({ chainHash: auditLog.chainHash })
      .from(auditLog)
      .where(eq(auditLog.tenantId, input.tenantId))
      .orderBy(desc(auditLog.id))
      .limit(1)
    const prevHash = prev[0]?.chainHash ?? ''
    const rowHash = sha256Hex(
      canonicalRow({
        tenantId: input.tenantId,
        eventType: input.type,
        actorId: input.actorId,
        resourceId: input.resourceId ?? null,
        payload: input.extra ?? {},
        occurredAt: occurredIso,
      }),
    )
    const chainHash = sha256Hex(prevHash + rowHash)
    await deps.db.insert(auditLog).values({
      tenantId: input.tenantId,
      eventType: input.type,
      actorId: input.actorId,
      resourceId: input.resourceId ?? null,
      payload: input.extra ?? {},
      occurredAt: new Date(occurredIso),
      rowHash,
      prevHash,
      chainHash,
    })
  }

  return {
    async emit(input: EmitInput): Promise<void> {
      const occurredIso = new Date().toISOString()
      const ev = buildEvent(input, occurredIso)

      // Chain the audit insert onto the tenant queue. Each tenant gets its
      // own serial pipeline; different tenants run concurrently.
      const prevQueue = tenantQueues.get(input.tenantId) ?? Promise.resolve()
      const next = prevQueue
        .catch(() => {
          /* prior insert failure shouldn't block this one — chain_hash
             integrity check will surface tampering anyway */
        })
        .then(() => appendChained(input, occurredIso))
      tenantQueues.set(input.tenantId, next)
      next.finally(() => {
        if (tenantQueues.get(input.tenantId) === next) {
          tenantQueues.delete(input.tenantId)
        }
      })

      await Promise.all([
        next.catch((err) => {
          logger.warn({ err, eventType: input.type }, 'audit chain insert failed')
        }),
        deps.eventAdapter.publish(ev).catch((err) => {
          logger.warn({ err, eventType: input.type }, 'EventAdapter.publish failed')
        }),
      ])
    },
  }
}

export type EventEmitter = ReturnType<typeof createEventEmitter>
