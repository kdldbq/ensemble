import type { WSContext } from 'hono/ws'
import type { Capability, IdentityContext } from '../adapters/types'
import type { TokenBucket } from '../realtime/backpressure'
import type { CellLockManager } from '../realtime/cell-lock-manager'
import type { CollabRoom } from '../realtime/collab-room'
import { parseInboundFrame } from '../realtime/messages'
import type { MutationBroadcaster } from '../realtime/mutation-broadcaster'
import type { PresenceTracker } from '../realtime/presence-tracker'
import { type RiskAdapter, scanPayload } from '../services/dlp-rules'

export interface SessionContext {
  ws: WSContext
  clientId: string
  identity: IdentityContext
  /**
   * Capabilities resolved at WS open. Cached for the session lifetime so each inbound
   * frame can be authorized without an extra adapter round-trip. The session does not
   * observe mid-session permission changes; revocation requires the client to reconnect.
   */
  capabilities: Capability
  workbookId: string
  room: CollabRoom
  /** T15 replaces this with a real TokenBucket. Until then, pass { take: () => true }. */
  bucket: TokenBucket
}

export interface SessionDeps {
  cellLocks: CellLockManager
  presence: PresenceTracker
  broadcaster: MutationBroadcaster
  /** Optional DLP intercept (I). When set, payloads are scanned and findings alerted. */
  risk?: RiskAdapter
  /** Default 'warn' (allow + alert). 'block' rejects the mutation outright. */
  dlpMode?: 'warn' | 'block'
}

export function createSession(ctx: SessionContext, deps: SessionDeps) {
  const { ws, clientId, identity, capabilities, workbookId, room, bucket } = ctx
  const { cellLocks, presence, broadcaster, risk, dlpMode } = deps

  function send(frame: unknown): void {
    ws.send(JSON.stringify(frame))
  }

  async function onMessage(raw: string): Promise<void> {
    const frame = parseInboundFrame(raw)
    if (!frame) return

    switch (frame.type) {
      case 'acquire_lock': {
        if (!capabilities.canEdit) {
          send({ type: 'error', code: 'forbidden', message: 'edit capability required' })
          return
        }
        const result = await cellLocks.acquire({
          workbookId,
          region: frame.region,
          userId: identity.userId,
        })
        if (result.acquired) {
          send({
            type: 'lock_granted',
            region: frame.region,
            ownerId: result.ownerId,
            ttlSec: result.ttlSec,
          })
          room.broadcastExcept(clientId, {
            type: 'lock_acquired',
            region: frame.region,
            ownerId: result.ownerId,
            ttlSec: result.ttlSec,
          })
        } else {
          send({ type: 'lock_denied', region: frame.region, ownerId: result.ownerId })
        }
        break
      }

      case 'release_lock': {
        await cellLocks.release({
          workbookId,
          region: frame.region,
          userId: identity.userId,
        })
        room.broadcast({ type: 'lock_released', region: frame.region })
        break
      }

      case 'submit_mutation': {
        // Defense in depth: even if a malicious client wires Univer to a viewer
        // session, every mutation frame must independently re-prove canEdit.
        // (UI-layer enforcement in @ensemble-sheets/core sets Univer readOnly
        // when canEdit is false, but the server cannot trust that.)
        if (!capabilities.canEdit) {
          send({ type: 'error', code: 'forbidden', message: 'edit capability required' })
          return
        }

        // T15 replaces the stub bucket with a real 30 ops/sec TokenBucket.
        if (!bucket.take()) {
          send({ type: 'error', code: 'rate_limited' })
          return
        }

        // Verify caller holds the lock for this region.
        const owner = await cellLocks.ownerOf({ workbookId, region: frame.region })
        if (owner !== identity.userId) {
          send({ type: 'error', code: 'lock_required' })
          return
        }

        // Renew the lock TTL while we persist.
        await cellLocks.renew({ workbookId, region: frame.region, userId: identity.userId })

        // I: streaming DLP intercept. Scan only when a sink is wired so default
        // path (no risk adapter) has zero overhead.
        if (risk) {
          const findings = scanPayload(frame.payload)
          if (findings.length > 0) {
            try {
              await risk.alert({
                tenantId: identity.tenantId,
                actorId: identity.userId,
                workbookId,
                findings,
              })
            } catch {
              /* never let alert errors break the edit path */
            }
            if (dlpMode === 'block') {
              send({ type: 'error', code: 'dlp_blocked', message: 'mutation matched DLP rules' })
              return
            }
          }
        }

        await broadcaster.submit({
          room,
          senderClientId: clientId,
          senderUserId: identity.userId,
          workbookId,
          clientSeq: frame.clientSeq,
          region: frame.region,
          payload: frame.payload,
        })
        break
      }

      case 'presence_heartbeat': {
        presence.heartbeat({
          workbookId,
          clientId,
          userId: identity.userId,
          ...(frame.cursor !== undefined ? { cursor: frame.cursor } : {}),
          ...(frame.selection !== undefined ? { selection: frame.selection } : {}),
        })
        room.broadcast({
          type: 'presence_update',
          entries: presence.list(workbookId),
        })
        break
      }
    }
  }

  function onClose(): void {
    presence.remove(workbookId, clientId)
    room.removeClient(clientId)
    room.broadcast({ type: 'user_left', clientId })
  }

  return { send, onMessage, onClose }
}

export type Session = ReturnType<typeof createSession>
