import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import type { StorageAdapter } from '../../src/adapters/storage'
import type { Capability } from '../../src/adapters/types'
import type { AppDeps } from '../../src/http/app'

/**
 * Shared stubs for unit tests that boot `buildApp` / `createServer` without
 * spinning up real Postgres + Redis. Each factory returns a fresh instance
 * so tests can mutate behavior (e.g. force a specific capability) without
 * cross-pollination.
 *
 * Filename starts with `_` so vitest's default `**\/*.test.ts` pattern skips it.
 */

export function makeStubIdentity(): IdentityAdapter {
  return {
    resolveFromToken: async () => ({ tenantId: 't1', userId: 'u1' }),
  }
}

export function makeStubPermission(capability?: Partial<Capability>): PermissionAdapter {
  const cap: Capability = {
    canView: false,
    canEdit: false,
    canShare: false,
    canDelete: false,
    ...capability,
  }
  return {
    getCapabilities: async () => cap,
    getMaskRules: async () => [],
  }
}

export const stubStorage: StorageAdapter = {
  put: async () => {},
  get: async () => new Uint8Array(),
  delete: async () => {},
}

export const stubDb = {} as AppDeps['db']

export const stubEvent = new NoopEventAdapter()

/** Loopback DSN that postgres-js will lazy-init without contacting the network. */
export const STUB_DATABASE_URL = 'postgres://stub:stub@127.0.0.1:1/stub'
