import type { WSContext } from 'hono/ws'
import { describe, expect, it, vi } from 'vitest'
import type { Capability, IdentityContext } from '../../src/adapters/types'
import { createCollabRoom } from '../../src/realtime/collab-room'
import { createSession } from '../../src/ws/session'

function makeCtx(overrides: {
  capabilities?: Partial<Capability>
  send?: (frame: unknown) => void
}) {
  const sent: unknown[] = []
  const send = overrides.send ?? ((frame: unknown) => sent.push(frame))
  const ws = { send: (s: string) => send(JSON.parse(s)) } as unknown as WSContext
  const identity: IdentityContext = { tenantId: 't1', userId: 'u-viewer' }
  const capabilities: Capability = {
    canView: true,
    canEdit: false,
    canShare: false,
    canDelete: false,
    ...overrides.capabilities,
  }
  const room = createCollabRoom({ workbookId: 'wb1' })
  room.addClient({ clientId: 'c1', userId: identity.userId, send })
  const bucket = { take: () => true }
  const cellLocks = {
    acquire: vi.fn(async () => ({ acquired: true, ownerId: identity.userId, ttlSec: 30 })),
    release: vi.fn(async () => true),
    renew: vi.fn(async () => true),
    ownerOf: vi.fn(async () => identity.userId),
  }
  const presence = {
    heartbeat: vi.fn(),
    list: vi.fn(() => []),
    remove: vi.fn(),
    startSweep: vi.fn(),
  }
  const broadcaster = { submit: vi.fn(async () => ({ seqNum: 7 })) }
  return {
    sent,
    cellLocks,
    presence,
    broadcaster,
    session: createSession(
      {
        ws,
        clientId: 'c1',
        identity,
        capabilities,
        workbookId: 'wb1',
        room,
        bucket,
      },
      {
        cellLocks: cellLocks as never,
        presence: presence as never,
        broadcaster: broadcaster as never,
      },
    ),
  }
}

describe('createSession — RBAC guard', () => {
  it('rejects acquire_lock for viewer (canEdit=false) with forbidden error', async () => {
    const { sent, cellLocks, session } = makeCtx({})
    await session.onMessage(JSON.stringify({ type: 'acquire_lock', region: 'A1:A1' }))
    expect(sent).toEqual([
      { type: 'error', code: 'forbidden', message: 'edit capability required' },
    ])
    expect(cellLocks.acquire).not.toHaveBeenCalled()
  })

  it('rejects submit_mutation for viewer with forbidden error', async () => {
    const { sent, broadcaster, session } = makeCtx({})
    await session.onMessage(
      JSON.stringify({ type: 'submit_mutation', clientSeq: 1, region: 'A1:A1', payload: {} }),
    )
    expect(sent).toEqual([
      { type: 'error', code: 'forbidden', message: 'edit capability required' },
    ])
    expect(broadcaster.submit).not.toHaveBeenCalled()
  })

  it('allows submit_mutation for editor with valid lock', async () => {
    const { sent, broadcaster, session } = makeCtx({ capabilities: { canEdit: true } })
    await session.onMessage(
      JSON.stringify({
        type: 'submit_mutation',
        clientSeq: 1,
        region: 'A1:A1',
        payload: { op: 'set' },
      }),
    )
    expect(broadcaster.submit).toHaveBeenCalledOnce()
    expect(sent.find((f) => (f as { type: string }).type === 'error')).toBeUndefined()
  })

  it('allows presence_heartbeat for viewer (canView only)', async () => {
    const { presence, session } = makeCtx({})
    await session.onMessage(
      JSON.stringify({
        type: 'presence_heartbeat',
        cursor: { sheet: 's1', row: 0, col: 0 },
      }),
    )
    expect(presence.heartbeat).toHaveBeenCalledOnce()
  })

  it('allows acquire_lock for editor', async () => {
    const { cellLocks, session } = makeCtx({ capabilities: { canEdit: true } })
    await session.onMessage(JSON.stringify({ type: 'acquire_lock', region: 'A1:A1' }))
    expect(cellLocks.acquire).toHaveBeenCalledOnce()
  })
})
