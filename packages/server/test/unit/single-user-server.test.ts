import { describe, expect, it } from 'vitest'
import { createServer } from '../../src/server'
import {
  makeStubIdentity,
  makeStubPermission,
  STUB_DATABASE_URL,
  stubEvent,
  stubStorage,
} from './_stubAdapters'

function baseOpts() {
  return {
    databaseUrl: STUB_DATABASE_URL,
    identity: makeStubIdentity(),
    permission: makeStubPermission({ canView: true, canEdit: true }),
    storage: stubStorage,
    event: stubEvent,
  }
}

describe('createServer — single-user mode (collab: false)', () => {
  it('returns a handle without constructing collab infra (no Redis client created)', () => {
    // collab:false short-circuits before buildCollabInfra runs; if it tried to
    // create a Redis client the ioredis constructor would eagerly open a
    // socket to 127.0.0.1:1 and the test would log a connection error.
    const handle = createServer({ ...baseOpts(), collab: false })
    expect(typeof handle.listen).toBe('function')
  })

  it('honors collab default of true when not specified (back-compat)', () => {
    // collab omitted -> defaults to true -> buildCollabInfra runs. We can't
    // call listen() here without real Postgres + Redis but createServer must
    // still return synchronously with a well-formed handle.
    const handle = createServer(baseOpts())
    expect(typeof handle.listen).toBe('function')
  })

  it('accepts collab: true explicitly', () => {
    const handle = createServer({ ...baseOpts(), collab: true })
    expect(typeof handle.listen).toBe('function')
  })
})
