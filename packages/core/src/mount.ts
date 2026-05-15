import { ApiClient } from './api-client'
import { createEditor, loadBrowserPlugins, type Editor } from './univer-wrapper'
import { WsClient, type WelcomeFrame } from './ws-client'
import { univerJsonToXlsx, xlsxToUniverJson } from './xlsx-converter'
import type { UniverWorkbookData } from './types'

export interface MountOpts {
  container: HTMLElement
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  fetch?: typeof fetch
  /** @internal — for tests */
  _editorFactory?: (container: HTMLElement) => Editor
  /** @internal — for tests */
  _wsConnect?: () => Promise<WelcomeFrame>
}

export interface MountHandle {
  save(): Promise<{ id: string }>
  exportXlsx(): Uint8Array
  destroy(): Promise<void>
}

export async function mountWorkbookEditor(opts: MountOpts): Promise<MountHandle> {
  const api = new ApiClient({
    baseUrl: opts.apiBaseUrl,
    token: opts.token,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  })
  const editor = (opts._editorFactory ?? ((c) => createEditor({ container: c })))(opts.container)
  const ws = new WsClient({ url: opts.wsBaseUrl, workbookId: opts.workbookId, token: opts.token })

  if (opts._wsConnect) {
    await opts._wsConnect()
  } else {
    /* v8 ignore next 2 — real WebSocket path; covered by T23 Playwright e2e */
    await ws.connect()
  }

  // In a real browser, load UI plugins (canvas, toolbar, formula bar) before
  // creating the workbook unit. In jsdom / Node _univer is present but the
  // dynamic imports will silently fail — that's fine for headless tests.
  /* v8 ignore next 2 — browser-only plugin loading path */
  if (!opts._editorFactory) {
    await loadBrowserPlugins(editor._univer, opts.container)
  }

  const snapshot = (await api.getLatestSnapshot(opts.workbookId)) as UniverWorkbookData | null
  const sheetId = `s1-${opts.workbookId}`
  const data: UniverWorkbookData =
    snapshot ??
    {
      id: opts.workbookId,
      sheetOrder: [sheetId],
      sheets: { [sheetId]: { id: sheetId, name: 'Sheet1', cellData: {} } },
    }
  editor.load(data)

  return {
    async save() {
      const data = editor.getData()
      const bytes = new TextEncoder().encode(JSON.stringify(data))
      const snap = await api.uploadSnapshot(opts.workbookId, bytes, { reason: 'manual' })
      return { id: snap.id }
    },
    exportXlsx() {
      return univerJsonToXlsx(editor.getData())
    },
    async destroy() {
      editor.destroy()
      ws.close()
    },
  }
}

export { univerJsonToXlsx, xlsxToUniverJson }
