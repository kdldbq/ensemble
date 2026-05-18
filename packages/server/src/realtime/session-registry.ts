import { logger } from '../logger'

/**
 * In-memory registry of live WebSocket sessions, indexed by sessionId and
 * scoped per-tenant on every read/write.
 *
 * Single-instance only. Multi-instance deployments need a Redis pub/sub
 * layer on top (e.g. to fan out kicks across nodes).
 */
export interface SessionHandle {
  /** Unique id for this session (the same value the admin route uses to kick). */
  sessionId: string
  userId: string
  tenantId: string
  workbookId: string
  openedAt: Date
  /**
   * Closes the underlying WebSocket. Implementations should be idempotent;
   * the registry calls it at most once per session and then unregisters.
   */
  close: () => void
}

export interface SessionRegistry {
  register(handle: SessionHandle): void
  unregister(sessionId: string): void
  get(sessionId: string): SessionHandle | undefined
  /** Tenant-scoped list. */
  list(tenantId: string): SessionHandle[]
  /** Sessions belonging to (userId, tenantId). Tenant boundary is enforced. */
  forUser(userId: string, tenantId: string): SessionHandle[]
  /** Sessions on a given workbook within a tenant. */
  forWorkbook(workbookId: string, tenantId: string): SessionHandle[]
  /**
   * Kick a single session. Returns true if the session existed in `tenantId`
   * and was closed. Returns false for unknown ids and — importantly — for
   * sessions belonging to a different tenant; cross-tenant kicks are refused
   * silently so existence of foreign sessions is not leaked.
   */
  kick(sessionId: string, tenantId: string): boolean
  /** Kick every session for (userId, tenantId). Returns the number closed. */
  kickForUser(userId: string, tenantId: string): number
  /** Kick every session for (workbookId, tenantId). Returns the number closed. */
  kickForWorkbook(workbookId: string, tenantId: string): number
}

export function createSessionRegistry(): SessionRegistry {
  const sessions = new Map<string, SessionHandle>()

  function closeAndDrop(handle: SessionHandle): void {
    try {
      handle.close()
    } catch (err) {
      // A handle's close() raising must not leave a stale entry behind, but
      // we want operators to see it — a buggy host close-callback otherwise
      // makes kick failures silently invisible.
      logger.warn({ err, sessionId: handle.sessionId }, 'session-registry: close() threw')
    }
    sessions.delete(handle.sessionId)
  }

  function filter(predicate: (h: SessionHandle) => boolean): SessionHandle[] {
    const out: SessionHandle[] = []
    for (const h of sessions.values()) {
      if (predicate(h)) out.push(h)
    }
    return out
  }

  function kickWhere(predicate: (h: SessionHandle) => boolean): number {
    // Snapshot via spread so closeAndDrop's sessions.delete during iteration
    // cannot skip entries (Map iterator is live).
    let n = 0
    for (const h of [...sessions.values()]) {
      if (predicate(h)) {
        closeAndDrop(h)
        n++
      }
    }
    return n
  }

  return {
    register(handle) {
      const existing = sessions.get(handle.sessionId)
      if (existing) {
        // Same sessionId registered twice — a duplicate clientId from a
        // reconnect, or a host wiring bug. Close the evicted handle so the
        // socket doesn't leak; warn so the duplication is visible.
        logger.warn(
          { sessionId: handle.sessionId },
          'session-registry: register evicted an existing handle',
        )
        try {
          existing.close()
        } catch (err) {
          logger.warn(
            { err, sessionId: handle.sessionId },
            'session-registry: evicted close() threw',
          )
        }
      }
      sessions.set(handle.sessionId, handle)
    },
    unregister(sessionId) {
      sessions.delete(sessionId)
    },
    get(sessionId) {
      return sessions.get(sessionId)
    },
    list(tenantId) {
      return filter((h) => h.tenantId === tenantId)
    },
    forUser(userId, tenantId) {
      return filter((h) => h.userId === userId && h.tenantId === tenantId)
    },
    forWorkbook(workbookId, tenantId) {
      return filter((h) => h.workbookId === workbookId && h.tenantId === tenantId)
    },
    kick(sessionId, tenantId) {
      const h = sessions.get(sessionId)
      if (!h || h.tenantId !== tenantId) return false
      closeAndDrop(h)
      return true
    },
    kickForUser(userId, tenantId) {
      return kickWhere((h) => h.userId === userId && h.tenantId === tenantId)
    },
    kickForWorkbook(workbookId, tenantId) {
      return kickWhere((h) => h.workbookId === workbookId && h.tenantId === tenantId)
    },
  }
}
