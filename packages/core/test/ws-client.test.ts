import { describe, expect, it } from 'vitest'
import { WsClient } from '../src/ws-client'

function stubSocketFactory() {
  const sockets: StubSocket[] = []
  class StubSocket {
    public sent: string[] = []
    public listeners = new Map<string, ((ev: { data: string }) => void)[]>()
    constructor(public readonly url: string) {
      sockets.push(this)
    }
    addEventListener(t: string, cb: (ev: { data: string }) => void) {
      this.listeners.set(t, [...(this.listeners.get(t) ?? []), cb])
    }
    send(d: string) { this.sent.push(d) }
    close() { this.listeners.get('close')?.forEach((cb) => cb({ data: '' })) }
    fire(t: string, data: string) { this.listeners.get(t)?.forEach((cb) => cb({ data })) }
  }
  return { sockets, Ctor: StubSocket }
}

describe('WsClient', () => {
  it('resolves welcome promise when server sends welcome frame', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({
      url: 'ws://x',
      workbookId: 'w1',
      token: () => 't',
      WebSocketImpl: Ctor as never,
    })
    const p = client.connect()
    expect(sockets[0].url).toContain('ws://x/api/v1/ws/w1?token=t')
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w1', seqNum: 0, snapshot: null }))
    const w = await p
    expect(w.workbookId).toBe('w1')
    expect(w.seqNum).toBe(0)
    expect(w.snapshot).toBeNull()
  })

  it('rejects when server sends error frame', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'error', code: 'unauthorized' }))
    await expect(p).rejects.toThrow(/unauthorized/)
  })

  it('resolves welcome when token is async (Promise)', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({
      url: 'ws://x',
      workbookId: 'w2',
      token: async () => 'async-tok',
      WebSocketImpl: Ctor as never,
    })
    const p = client.connect()
    // socket is created after the async token resolves — wait one microtask tick
    await Promise.resolve()
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w2', seqNum: 1, snapshot: null }))
    const w = await p
    expect(w.workbookId).toBe('w2')
    expect(sockets[0].url).toContain('token=async-tok')
  })

  it('rejects when socket closes before welcome', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('close', '')
    await expect(p).rejects.toThrow(/closed before welcome/)
  })

  it('rejects with error when message is malformed JSON', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('message', 'not-json{{{')
    await expect(p).rejects.toThrow()
  })

  it('close() is safe to call before connect()', () => {
    const { Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    // Should not throw even though socket is null
    expect(() => client.close()).not.toThrow()
  })
})
