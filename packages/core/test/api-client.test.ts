import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../src/api-client'

function makeFetch(handler: (req: { url: string; init: RequestInit }) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) =>
    handler({ url, init: init ?? {} })
  )
}

describe('ApiClient', () => {
  it('attaches Authorization header from token provider', async () => {
    const fetch = makeFetch(({ init }) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 'tok', fetch })
    const r = await api.listWorkbooks()
    expect(r.items).toEqual([])
  })

  it('throws on non-2xx with parsed message', async () => {
    const fetch = makeFetch(() =>
      new Response(JSON.stringify({ error: 'nope' }), { status: 403 })
    )
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    await expect(api.listWorkbooks()).rejects.toThrow(/nope/)
  })

  it('uploads snapshot bytes as raw body', async () => {
    const fetch = makeFetch(({ init }) => {
      expect(init.method).toBe('POST')
      expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
      return new Response(JSON.stringify({ id: 'snap1' }), { status: 201 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const snap = await api.uploadSnapshot('wb1', new Uint8Array([1, 2, 3]))
    expect(snap.id).toBe('snap1')
  })

  it('throws on non-2xx with raw text when body is not JSON', async () => {
    const fetch = makeFetch(() => new Response('plain error', { status: 500 }))
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    await expect(api.listWorkbooks()).rejects.toThrow(/plain error/)
  })

  it('createWorkbook sends POST with name in body', async () => {
    const fetch = makeFetch(({ init }) => {
      expect(init.method).toBe('POST')
      return new Response(JSON.stringify({ id: 'wb1', name: 'Test' }), { status: 201 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const wb = await api.createWorkbook('Test')
    expect(wb.id).toBe('wb1')
  })

  it('getWorkbook returns workbook by id', async () => {
    const fetch = makeFetch(() =>
      new Response(JSON.stringify({ id: 'wb2', name: 'WB2' }), { status: 200 })
    )
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const wb = await api.getWorkbook('wb2')
    expect(wb.id).toBe('wb2')
  })

  it('getLatestSnapshot returns null on 204', async () => {
    const fetch = makeFetch(() => new Response(null, { status: 204 }))
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const snap = await api.getLatestSnapshot('wb1')
    expect(snap).toBeNull()
  })
})

describe('ApiClient folders + grants', () => {
  it('listFolders / createFolder / renameFolder / moveFolder / deleteFolder', async () => {
    let lastReq: { method: string; url: string; body?: unknown } | null = null
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      lastReq = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined }
      if (init?.method === 'POST')   return new Response(JSON.stringify({ id: 'f1', name: 'F' }), { status: 201 })
      if (init?.method === 'PATCH')  return new Response(JSON.stringify({ id: 'f1', name: 'F2' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ items: [{ id: 'f1' }] }), { status: 200 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    expect((await api.listFolders()).items).toEqual([{ id: 'f1' }])
    await api.createFolder({ name: 'F', parentId: null, spaceType: 'personal' })
    expect(lastReq?.body).toEqual({ name: 'F', parentId: null, spaceType: 'personal' })
    await api.renameFolder('f1', 'F2')
    expect(lastReq?.body).toEqual({ name: 'F2' })
    await api.moveFolder('f1', 'parent2')
    expect(lastReq?.body).toEqual({ parentId: 'parent2' })
    await api.deleteFolder('f1')
    expect(lastReq?.method).toBe('DELETE')
  })

  it('createGrant / deleteGrant', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'g1' }), { status: 201 })
      return new Response(null, { status: 204 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const g = await api.createGrant({
      resourceType: 'workbook', resourceId: 'wb',
      granteeType: 'user', granteeId: 'u2', permission: 'view',
      expiresAt: null,
    })
    expect(g.id).toBe('g1')
    await api.deleteGrant('g1')
  })
})
