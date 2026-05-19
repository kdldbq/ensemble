import { describe, expect, it, vi } from 'vitest'
import { mountWorkbookEditor } from '../src/mount'

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

const noopFetch = vi.fn(async (url: string) => {
  if (url.endsWith('/snapshot'))
    return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), {
      status: 200,
    })
  return new Response(
    JSON.stringify({
      id: 'snap-single',
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

describe('mountWorkbookEditor — single-user mode (collab: false)', () => {
  it('skips ws.connect() — socket stays null, never calls onWsConnected', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()
    const onWsConnected = vi.fn()
    // _wsConnect is intentionally not passed — collab:false must skip the
    // connect path entirely, including the test stub.
    const wsConnectSpy = vi.fn()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      collab: false,
      onWsConnected,
      fetch: noopFetch,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: wsConnectSpy as never,
    })

    expect(wsConnectSpy).not.toHaveBeenCalled()
    expect(onWsConnected).not.toHaveBeenCalled()
    expect(handle._wsClient.isConnected()).toBe(false)
    expect(handle.connectionState()).toBe('offline')
  })

  it('save() still works in single-user mode (REST-only path)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      collab: false,
      fetch: noopFetch,
      _editorFactory: () => fakeEditor as never,
    })

    const result = await handle.save()
    expect(result.id).toBe('snap-single')
  })

  it('subscribe callbacks register but never fire (no socket → no frames)', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const fakeEditor = makeFakeEditor()
    const onMutation = vi.fn()
    const onPresence = vi.fn()
    const onState = vi.fn()
    const onNotification = vi.fn()

    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: () => 't',
      collab: false,
      fetch: noopFetch,
      _editorFactory: () => fakeEditor as never,
    })

    const unsub1 = handle.onMutationApplied(onMutation)
    const unsub2 = handle.onPresence(onPresence)
    const unsub3 = handle.onConnectionChange(onState)
    const unsub4 = handle.onNotification(onNotification)

    expect(typeof unsub1).toBe('function')
    expect(typeof unsub2).toBe('function')
    expect(typeof unsub3).toBe('function')
    expect(typeof unsub4).toBe('function')
    expect(onMutation).not.toHaveBeenCalled()
    expect(onPresence).not.toHaveBeenCalled()
    expect(onNotification).not.toHaveBeenCalled()
    // onConnectionChange fires once with the current state on subscription
    // (so consumers don't miss the initial value). In single-user mode the
    // state stays 'offline' forever — no transitions to / from 'connecting'
    // because connect() was skipped.
    expect(onState).toHaveBeenCalledTimes(1)
    expect(onState).toHaveBeenCalledWith('offline')
  })
})
