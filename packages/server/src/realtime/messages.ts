export type InboundFrame =
  | { type: 'acquire_lock'; region: string }
  | { type: 'release_lock'; region: string }
  | { type: 'submit_mutation'; clientSeq: number; region: string; payload: unknown }
  | { type: 'presence_heartbeat'; cursor?: { sheet: string; row: number; col: number }; selection?: unknown }

export type OutboundFrame =
  | { type: 'welcome'; workbookId: string; seqNum: number; snapshot: unknown; presence: unknown[]; locks: unknown[] }
  | { type: 'lock_granted'; region: string; ownerId: string; ttlSec: number }
  | { type: 'lock_denied'; region: string; ownerId: string }
  | { type: 'lock_acquired'; region: string; ownerId: string; ttlSec: number }
  | { type: 'lock_released'; region: string }
  | { type: 'mutation_accepted'; clientSeq: number; seqNum: number }
  | { type: 'apply_mutation'; seqNum: number; userId: string; payload: unknown }
  | { type: 'presence_update'; entries: unknown[] }
  | { type: 'user_left'; clientId: string }
  | { type: 'replay_complete'; seqNum: number }
  | { type: 'error'; code: string; message?: string }

export function parseInboundFrame(raw: string): InboundFrame | null {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return null }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  switch (o['type']) {
    case 'acquire_lock':
      return typeof o['region'] === 'string'
        ? { type: 'acquire_lock', region: o['region'] }
        : null
    case 'release_lock':
      return typeof o['region'] === 'string'
        ? { type: 'release_lock', region: o['region'] }
        : null
    case 'submit_mutation':
      if (typeof o['clientSeq'] === 'number' && typeof o['region'] === 'string') {
        return {
          type: 'submit_mutation',
          clientSeq: o['clientSeq'],
          region: o['region'],
          payload: o['payload'],
        }
      }
      return null
    case 'presence_heartbeat': {
      // Build cursor only when all three fields are present and correctly typed
      // exactOptionalPropertyTypes: spread conditional object instead of imperative assignment
      const rawCursor = o['cursor']
      const validCursor =
        rawCursor !== null &&
        typeof rawCursor === 'object' &&
        typeof (rawCursor as Record<string, unknown>)['sheet'] === 'string' &&
        typeof (rawCursor as Record<string, unknown>)['row'] === 'number' &&
        typeof (rawCursor as Record<string, unknown>)['col'] === 'number'
          ? {
              sheet: (rawCursor as Record<string, unknown>)['sheet'] as string,
              row: (rawCursor as Record<string, unknown>)['row'] as number,
              col: (rawCursor as Record<string, unknown>)['col'] as number,
            }
          : undefined

      const hasSelection = 'selection' in o

      // Use spread to satisfy exactOptionalPropertyTypes: only include keys that are defined
      return {
        type: 'presence_heartbeat',
        ...(validCursor !== undefined ? { cursor: validCursor } : {}),
        ...(hasSelection ? { selection: o['selection'] } : {}),
      }
    }
    default:
      return null
  }
}
