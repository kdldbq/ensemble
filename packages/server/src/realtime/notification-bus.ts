/**
 * In-process notification bus for real-time push (e.g. @mention).
 *
 * Subscribe by workbookId on WS open, unsubscribe on close. Publishers (REST
 * routes like comments / activity) call publish() without knowing about WS.
 *
 * Single-process only — for multi-process deployments wrap this in a Redis
 * pub/sub forwarder (same shape as MaskRuleCache invalidation).
 */

export interface NotificationFrame {
  type: 'notification'
  kind: string
  workbookId: string
  recipients: string[]
  extra?: Record<string, unknown>
  ts: string
}

type Listener = (frame: NotificationFrame) => void

export function createNotificationBus() {
  const subs = new Map<string, Set<Listener>>()

  return {
    subscribe(workbookId: string, cb: Listener): () => void {
      let set = subs.get(workbookId)
      if (!set) {
        set = new Set()
        subs.set(workbookId, set)
      }
      set.add(cb)
      return () => {
        const s = subs.get(workbookId)
        if (!s) return
        s.delete(cb)
        if (s.size === 0) subs.delete(workbookId)
      }
    },
    publish(frame: Omit<NotificationFrame, 'type' | 'ts'> & { ts?: string }): void {
      const filled: NotificationFrame = {
        type: 'notification',
        kind: frame.kind,
        workbookId: frame.workbookId,
        recipients: frame.recipients,
        ts: frame.ts ?? new Date().toISOString(),
        ...(frame.extra ? { extra: frame.extra } : {}),
      }
      const set = subs.get(frame.workbookId)
      if (!set) return
      for (const cb of set) {
        try {
          cb(filled)
        } catch {
          /* swallow */
        }
      }
    },
    _subscriberCount(workbookId: string): number {
      return subs.get(workbookId)?.size ?? 0
    },
  }
}

export type NotificationBus = ReturnType<typeof createNotificationBus>
