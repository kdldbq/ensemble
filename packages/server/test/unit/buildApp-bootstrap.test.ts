import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import type { AppDeps } from '../../src/http/app'
import { buildApp } from '../../src/http/app'

const identity: IdentityAdapter = {
  resolveFromToken: async () => ({ tenantId: 't1', userId: 'u1' }),
}
const permission: PermissionAdapter = {
  getCapabilities: async () => ({
    canView: false,
    canEdit: false,
    canShare: false,
    canDelete: false,
  }),
  getMaskRules: async () => [],
}

const stubDb = {} as AppDeps['db']

const baseDeps: AppDeps = {
  db: stubDb,
  identity,
  permission,
  storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
  event: new NoopEventAdapter(),
}

describe('buildApp bootstrap: ENSEMBLE_LINK_HMAC_SECRET', () => {
  const origEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.NODE_ENV = origEnv
  })

  afterEach(() => {
    process.env.NODE_ENV = origEnv
  })

  it('throws in production when linkHmacSecret is absent', () => {
    process.env.NODE_ENV = 'production'
    expect(() => buildApp(baseDeps)).toThrow(/ENSEMBLE_LINK_HMAC_SECRET/i)
  })

  it('throws in production when linkHmacSecret is empty string', () => {
    process.env.NODE_ENV = 'production'
    expect(() => buildApp({ ...baseDeps, linkHmacSecret: '' })).toThrow(
      /ENSEMBLE_LINK_HMAC_SECRET/i,
    )
  })

  it('throws in production when linkHmacSecret is too short', () => {
    process.env.NODE_ENV = 'production'
    expect(() => buildApp({ ...baseDeps, linkHmacSecret: 'short' })).toThrow(
      /ENSEMBLE_LINK_HMAC_SECRET/i,
    )
  })

  it('succeeds in production when linkHmacSecret is provided', () => {
    process.env.NODE_ENV = 'production'
    expect(() => buildApp({ ...baseDeps, linkHmacSecret: 'a'.repeat(64) })).not.toThrow()
  })

  it('succeeds in non-production without linkHmacSecret', () => {
    process.env.NODE_ENV = 'test'
    expect(() => buildApp(baseDeps)).not.toThrow()
  })
})
