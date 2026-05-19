import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppDeps } from '../../src/http/app'
import { buildApp } from '../../src/http/app'
import {
  makeStubIdentity,
  makeStubPermission,
  stubDb,
  stubEvent,
  stubStorage,
} from './_stubAdapters'

const baseDeps: AppDeps = {
  db: stubDb,
  identity: makeStubIdentity(),
  permission: makeStubPermission(),
  storage: stubStorage,
  event: stubEvent,
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
