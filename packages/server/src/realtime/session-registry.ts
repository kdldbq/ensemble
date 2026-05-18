/**
 * In-memory registry of live WebSocket sessions.
 *
 * Existed-to-fix: WS sessions cache capabilities at open time (see ws/session.ts).
 * Without a registry, a grant revoked via DELETE /api/v1/grants/:id leaves
 * active sockets in place — the user keeps the previous capability until they
 * voluntarily disconnect. The admin kick endpoints (`/api/v1/admin/sessions/*`)
 * and the auto-kick path from the grants DELETE handler look up sockets here
 * to close them out of band.
 *
 * Scope: single-instance only. Multi-instance deployments need Redis pub/sub
 * on top — out of scope for this PR; tracked by an issue follow-up.
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
    } catch {
      // close() raising must not leave a stale registry entry behind.
    }
    sessions.delete(handle.sessionId)
  }

  return {
    register(handle) {
      sessions.set(handle.sessionId, handle)
    },
    unregister(sessionId) {
      sessions.delete(sessionId)
    },
    get(sessionId) {
      return sessions.get(sessionId)
    },
    list(tenantId) {
      const out: SessionHandle[] = []
      for (const h of sessions.values()) {
        if (h.tenantId === tenantId) out.push(h)
      }
      return out
    },
    forUser(userId, tenantId) {
      const out: SessionHandle[] = []
      for (const h of sessions.values()) {
        if (h.userId === userId && h.tenantId === tenantId) out.push(h)
      }
      return out
    },
    forWorkbook(workbookId, tenantId) {
      const out: SessionHandle[] = []
      for (const h of sessions.values()) {
        if (h.workbookId === workbookId && h.tenantId === tenantId) out.push(h)
      }
      return out
    },
    kick(sessionId, tenantId) {
      const h = sessions.get(sessionId)
      if (!h || h.tenantId !== tenantId) return false
      closeAndDrop(h)
      return true
    },
    kickForUser(userId, tenantId) {
      let n = 0
      for (const h of [...sessions.values()]) {
        if (h.userId === userId && h.tenantId === tenantId) {
          closeAndDrop(h)
          n++
        }
      }
      return n
    },
    kickForWorkbook(workbookId, tenantId) {
      let n = 0
      for (const h of [...sessions.values()]) {
        if (h.workbookId === workbookId && h.tenantId === tenantId) {
          closeAndDrop(h)
          n++
        }
      }
      return n
    },
  }
}
