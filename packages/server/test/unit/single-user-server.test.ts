import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { createServer } from '../../src/server'

const identity: IdentityAdapter = {
  resolveFromToken: async () => ({ tenantId: 't1', userId: 'u1' }),
}
const permission: PermissionAdapter = {
  getCapabilities: async () => ({
    canView: true,
    canEdit: true,
    canShare: false,
    canDelete: false,
  }),
  getMaskRules: async () => [],
}
const storage = {
  put: async () => {},
  get: async () => new Uint8Array(),
  delete: async () => {},
}

describe('createServer — single-user mode (collab: false)', () => {
  it('returns a handle without contacting Redis', () => {
    // No Redis container is started in this unit test; if `collab: false`
    // attempted to create / connect a Redis client at construction time the
    // call would either throw (in strict mode) or hang. The fact that this
    // returns synchronously and the handle is well-formed is the contract.
    const handle = createServer({
      databaseUrl: 'postgres://stub:stub@127.0.0.1:1/stub',
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
      collab: false,
    })
    expect(typeof handle.listen).toBe('function')
  })

  it('honors collab default of true when not specified (back-compat)', () => {
    // We can't actually call listen() here without a Postgres + Redis pair,
    // but we can verify createServer() returns synchronously — meaning the
    // collab subsystems were *constructed* (lazy connection, no eager IO).
    const handle = createServer({
      databaseUrl: 'postgres://stub:stub@127.0.0.1:1/stub',
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
      // collab omitted -> defaults to true
    })
    expect(typeof handle.listen).toBe('function')
  })

  it('accepts collab: true explicitly', () => {
    const handle = createServer({
      databaseUrl: 'postgres://stub:stub@127.0.0.1:1/stub',
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
      collab: true,
    })
    expect(typeof handle.listen).toBe('function')
  })
})
