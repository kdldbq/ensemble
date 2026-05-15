import { describe, expect, it } from 'vitest'
import {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from '../../src/adapters/identity'
import type {
  IdentityAdapter,
  PermissionAdapter,
  StorageAdapter,
  EventAdapter,
} from '../../src/index'

describe('adapter contracts', () => {
  it('NotImplementedIdentityAdapter rejects when called', async () => {
    const a: IdentityAdapter = new NotImplementedIdentityAdapter()
    await expect(a.resolveFromToken('x')).rejects.toThrow(/not implemented/i)
  })

  it('NotImplementedPermissionAdapter rejects on getCapabilities', async () => {
    const a: PermissionAdapter = new NotImplementedPermissionAdapter()
    await expect(
      a.getCapabilities({ tenantId: 't', userId: 'u' }, { type: 'workbook', id: 'w', tenantId: 't' })
    ).rejects.toThrow(/not implemented/i)
  })

  it('NoopEventAdapter resolves silently', async () => {
    const a: EventAdapter = new NoopEventAdapter()
    await expect(
      a.publish({ type: 'workbook.opened', workbookId: 'w', userId: 'u', at: new Date().toISOString() })
    ).resolves.toBeUndefined()
  })

  it('StorageAdapter type accepts minimal duck', () => {
    const fake: StorageAdapter = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async () => {},
    }
    expect(fake.put).toBeTypeOf('function')
  })
})
