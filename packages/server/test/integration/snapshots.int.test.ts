import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FsStorage } from '@ensemble-sheets/storage-fs'
import { describe, expect, it } from 'vitest'
import {
  type IdentityAdapter,
  NoopEventAdapter,
  type PermissionAdapter,
} from '../../src/adapters/identity'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { db } from './_dbHelpers'

function memStorage() {
  const blobs = new Map<string, Uint8Array>()
  return {
    storage: {
      put: async (k: string, b: Uint8Array) => {
        blobs.set(k, b)
      },
      get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => {
        blobs.delete(k)
      },
    },
    blobs,
  }
}

describe('snapshots REST', () => {
  it('POST creates snapshot, GET returns the bytes back', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: ms.storage,
      event: new NoopEventAdapter(),
    })

    const payload = new TextEncoder().encode('{"sheets":{}}')
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)
    const snap = (await post.json()) as { id: string }

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshots/${snap.id}/blob`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = new Uint8Array(await get.arrayBuffer())
    expect(new TextDecoder().decode(body)).toBe('{"sheets":{}}')
  })

  it('GET /snapshot returns the latest snapshot bytes after a POST', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-latest-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB-latest' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: ms.storage,
      event: new NoopEventAdapter(),
    })

    const payload = new TextEncoder().encode('{"sheets":{"s1":{}}}')
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = new Uint8Array(await get.arrayBuffer())
    expect(new TextDecoder().decode(body)).toBe('{"sheets":{"s1":{}}}')
  })

  it('GET /snapshot returns 204 when workbook has no snapshots', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-empty-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB-empty' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: ms.storage,
      event: new NoopEventAdapter(),
    })

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(204)
  })

  it('GET blob returns 404 when snapshotId belongs to a different workbook', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-xwb-t' }).returning()
    const [wb1] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB1' })
      .returning()
    const [wb2] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB2' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: ms.storage,
      event: new NoopEventAdapter(),
    })

    // Create a snapshot under wb1
    const payload = new TextEncoder().encode('{"wb":"1"}')
    const post = await app.request(`/api/v1/workbooks/${wb1.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)
    const snap = (await post.json()) as { id: string }

    // Try to access that snapshot via wb2 — must be 404 (not 403 to avoid leaking existence)
    const get = await app.request(`/api/v1/workbooks/${wb2.id}/snapshots/${snap.id}/blob`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(404)
  })

  it('POST returns 404 when workbookId does not exist', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-nowb-t' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: memStorage().storage,
      event: new NoopEventAdapter(),
    })

    const res = await app.request(
      '/api/v1/workbooks/00000000-0000-0000-0000-000000000000/snapshots',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
        body: new TextEncoder().encode('{"x":1}'),
      },
    )
    expect(res.status).toBe(404)
  })

  it('POST returns 400 when body is empty', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-empty-body-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB-emptybody' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: memStorage().storage,
      event: new NoopEventAdapter(),
    })

    const res = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new Uint8Array(0),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('empty body')
  })

  it('POST snapshot with name and reason query params', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-named-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB-named' })
      .returning()
    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: ms.storage,
      event: new NoopEventAdapter(),
    })

    const res = await app.request(`/api/v1/workbooks/${wb.id}/snapshots?reason=named&name=v1.0`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode('{"sheets":{}}'),
    })
    expect(res.status).toBe(201)
    const snap = (await res.json()) as { name: string; reason: string }
    expect(snap.name).toBe('v1.0')
    expect(snap.reason).toBe('named')
  })

  it('GET /snapshot returns 404 when workbookId does not exist', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-latest-nowb-t' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db,
      identity,
      permission,
      storage: memStorage().storage,
      event: new NoopEventAdapter(),
    })

    const res = await app.request(
      '/api/v1/workbooks/00000000-0000-0000-0000-000000000000/snapshot',
      { headers: { Authorization: 'Bearer x' } },
    )
    expect(res.status).toBe(404)
  })

  it('snapshot round-trips through FsStorage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'snap-fs-'))
    const storage = new FsStorage({ root: dir })
    const [tenant] = await db.insert(tenants).values({ name: 'snap-fs-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: true,
        canShare: true,
        canDelete: true,
      }),
      getMaskRules: async () => [],
    }
    const app = buildApp({ db, identity, permission, storage, event: new NoopEventAdapter() })
    const payload = new TextEncoder().encode('{"fs":"ok"}')
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)
    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = new Uint8Array(await get.arrayBuffer())
    expect(new TextDecoder().decode(body)).toBe('{"fs":"ok"}')
  })
})
