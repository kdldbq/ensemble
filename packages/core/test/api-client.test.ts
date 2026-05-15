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
})
