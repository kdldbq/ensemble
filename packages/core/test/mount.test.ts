import { describe, expect, it, vi } from 'vitest'
import { mountWorkbookEditor } from '../src/mount'
import type { WelcomeFrame } from '../src/ws-client'

const wsStub = async (): Promise<WelcomeFrame> => ({
  type: 'welcome',
  workbookId: 'w',
  seqNum: 0,
  snapshot: null,
})

function makeFakeEditor() {
  const loaded: unknown[] = []
  const editor = {
    load: (d: unknown) => loaded.push(d),
    getData: () => ({
      id: 'w',
      sheetOrder: ['s'],
      sheets: { s: { id: 's', name: 'S', cellData: {} } },
    }),
    destroy: vi.fn(),
    _loaded: loaded,
  }
  return editor
}

describe('mountWorkbookEditor', () => {
  it('fetches snapshot, loads editor, returns save/destroy handles', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: async () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
            status: 200,
          })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    expect(fakeEditor._loaded.length).toBe(1)
    expect(typeof handle.save).toBe('function')
    expect(typeof handle.destroy).toBe('function')
    expect(typeof handle.exportXlsx).toBe('function')
  })

  it('uses blank workbook when snapshot returns 204', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    await mountWorkbookEditor({
      container,
      workbookId: 'wb2',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    // load was called with the blank fallback (id = workbookId, sheetId derived from workbookId)
    const loaded = fakeEditor._loaded[0] as {
      id: string
      sheetOrder: string[]
      sheets: Record<string, { id: string }>
    }
    expect(fakeEditor._loaded.length).toBe(1)
    expect(loaded.id).toBe('wb2')
    // B3: sheetId is derived from workbookId, not hardcoded 's1'
    expect(loaded.sheetOrder).toEqual(['s1-wb2'])
    expect(loaded.sheets['s1-wb2']).toBeDefined()
    expect(loaded.sheets['s1-wb2'].id).toBe('s1-wb2')
  })

  it('save() uploads snapshot and returns id', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/snapshot'))
        return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
          status: 200,
        })
      // POST snapshots → return a Snapshot object
      return new Response(
        JSON.stringify({
          id: 'snap1',
          workbookId: 'w',
          storageKey: 'k',
          sizeBytes: 1,
          createdBy: 'u',
          createdAt: '2026-01-01',
          reason: 'manual',
          name: null,
        }),
        { status: 200 },
      )
    }) as never

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: fetchMock,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    const result = await handle.save()
    expect(result.id).toBe('snap1')
  })

  it('exportXlsx() returns a Uint8Array', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
            status: 200,
          })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    const bytes = handle.exportXlsx()
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('destroy() calls editor.destroy and ws.close', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
            status: 200,
          })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    handle.destroy()
    expect(fakeEditor.destroy).toHaveBeenCalledOnce()
  })

  it('handle exposes _wsClient', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
            status: 200,
          })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    expect(handle._wsClient).toBeTruthy()
  })

  it('await destroy() resolves without throwing (B1 async destroy)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
            status: 200,
          })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    await expect(handle.destroy()).resolves.toBeUndefined()
  })

  it('exposes onMutationApplied / onPresence / onSaved subscriptions returning unsubscribe', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    expect(typeof handle.onMutationApplied).toBe('function')
    expect(typeof handle.onPresence).toBe('function')
    expect(typeof handle.onSaved).toBe('function')

    const unsubM = handle.onMutationApplied(() => {})
    const unsubP = handle.onPresence(() => {})
    const unsubS = handle.onSaved(() => {})
    expect(typeof unsubM).toBe('function')
    expect(typeof unsubP).toBe('function')
    expect(typeof unsubS).toBe('function')
    unsubM()
    unsubP()
    unsubS()
  })

  it('save() fires onSaved listeners with the new snapshot id', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/snapshot'))
        return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
          status: 200,
        })
      return new Response(
        JSON.stringify({
          id: 'snap-xyz',
          workbookId: 'w',
          storageKey: 'k',
          sizeBytes: 1,
          createdBy: 'u',
          createdAt: '2026-01-01',
          reason: 'manual',
          name: null,
        }),
        { status: 200 },
      )
    }) as never

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      fetch: fetchMock,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsStub,
    })

    const seenSnapshotIds: string[] = []
    handle.onSaved((id) => seenSnapshotIds.push(id))
    await handle.save()
    expect(seenSnapshotIds).toEqual(['snap-xyz'])
  })
})
