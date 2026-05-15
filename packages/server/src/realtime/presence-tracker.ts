export interface PresenceEntry {
  clientId: string
  userId: string
  cursor?: { sheet: string; row: number; col: number }
  selection?: unknown
  lastSeenAt: number
}

export interface HeartbeatInput {
  workbookId: string
  clientId: string
  userId: string
  cursor?: PresenceEntry['cursor']
  selection?: unknown
}

export interface SweepOpts {
  intervalMs: number
  onEvict: (workbookId: string, clientId: string) => void
}

export function createPresenceTracker(opts: { evictAfterMs: number }) {
  const byWorkbook = new Map<string, Map<string, PresenceEntry>>()

  function evictForWorkbook(wbId: string, now: number): string[] {
    const m = byWorkbook.get(wbId)
    if (!m) return []
    const cutoff = now - opts.evictAfterMs
    const dropped: string[] = []
    for (const [cid, entry] of m) {
      if (entry.lastSeenAt < cutoff) {
        m.delete(cid)
        dropped.push(cid)
      }
    }
    return dropped
  }

  return {
    heartbeat(input: HeartbeatInput): void {
      let m = byWorkbook.get(input.workbookId)
      if (!m) { m = new Map(); byWorkbook.set(input.workbookId, m) }
      m.set(input.clientId, {
        clientId: input.clientId,
        userId: input.userId,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.selection !== undefined ? { selection: input.selection } : {}),
        lastSeenAt: Date.now(),
      })
    },
    list(workbookId: string): PresenceEntry[] {
      return Array.from(byWorkbook.get(workbookId)?.values() ?? [])
    },
    remove(workbookId: string, clientId: string): void {
      byWorkbook.get(workbookId)?.delete(clientId)
    },
    evictStale(workbookId: string): string[] {
      return evictForWorkbook(workbookId, Date.now())
    },
    startSweep(s: SweepOpts): () => void {
      const handle = setInterval(() => {
        const now = Date.now()
        for (const wbId of byWorkbook.keys()) {
          for (const cid of evictForWorkbook(wbId, now)) s.onEvict(wbId, cid)
        }
      }, s.intervalMs)
      return () => clearInterval(handle)
    },
  }
}

export type PresenceTracker = ReturnType<typeof createPresenceTracker>
