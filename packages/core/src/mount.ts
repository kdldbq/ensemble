import { CustomCommandExecutionError } from '@univerjs/core'
import { ApiClient } from './api-client'
import type { UniverWorkbookData } from './types'
import { type Editor, createEditor, loadBrowserLocales, loadBrowserPlugins } from './univer-wrapper'
import { type PresenceEntry, type WelcomeFrame, WsClient } from './ws-client'
import { univerJsonToXlsx, xlsxToUniverJson } from './xlsx-converter'

/**
 * Univer 0.22's CommandType.MUTATION value. Hard-coded to avoid importing the
 * enum into Node-only test paths (the import would pull in render engine code
 * that requires a browser). The value comes from
 * `@univerjs/core/lib/types/shared/command-enum.d.ts`.
 */
const COMMAND_TYPE_MUTATION = 2

/**
 * Univer command id fired whenever the active cell selection moves. We listen
 * to its before-execute hook to track which cell the user is "intending to
 * edit", so we can acquire a lock for that specific region before any mutation
 * goes out. (Documented in `@univerjs/sheets` SetSelectionsOperation.)
 */
const SET_SELECTIONS_OPERATION_ID = 'sheet.operation.set-selections'

export interface CollabCapability {
  /**
   * When false, the editor enters viewer mode: outbound mutations are not sent
   * via WebSocket and the session-level edit lock is not acquired. The server
   * also enforces this independently (defense in depth).
   */
  canEdit: boolean
}

export interface MountOpts {
  container: HTMLElement
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  fetch?: typeof fetch
  /**
   * Capability hints for UI gating. Server still validates every WS frame against
   * its own PermissionAdapter — these flags only affect the local Univer behavior
   * (toolbar enable/disable, outbound mutation pipeline, lock acquisition).
   */
  capabilities?: CollabCapability
  /**
   * When set to a positive number, the editor auto-saves a snapshot N ms after
   * the last local mutation. Required by the demo's viewer-preview panel so the
   * derived view stays in sync without the user hitting the Save button. Set
   * to 0 / undefined for manual-save-only behavior (the original v0.1 contract).
   */
  autoSaveMs?: number
  /** Called immediately after the WS welcome frame is received, before plugins load.
   *  Use this to wire up WS-level helpers (e.g. acquireLock) without waiting for the
   *  full editor mount cycle. */
  onWsConnected?: (ws: WsClient) => void
  /**
   * Overlay watermark rendered on top of the canvas. Best-effort leak deterrence:
   * the overlay is `pointer-events: none` so it doesn't intercept clicks but does
   * appear in screenshots/screen recordings. NOT anti-screenshot (browsers cannot
   * truly prevent that).
   */
  watermark?: {
    text: string
    /** 0..1, default 0.08 */
    opacity?: number
    /** CSS color string, default #1f2937 */
    color?: string
    /** Rotation in degrees, default -22 */
    rotateDeg?: number
  }
  /**
   * Best-effort copy / print deterrence. When true:
   * - Container gets `user-select: none` (blocks Ctrl-A → Ctrl-C of cell text).
   * - `@media print` hides the container entirely (Cmd-P prints blank page).
   * - Container blurs while window is unfocused (deters over-the-shoulder photos).
   * Browsers cannot truly prevent screenshots — these are speed bumps, not
   * security boundaries. Pair with watermark for forensic attribution.
   */
  preventCopy?: boolean
  /** @internal — for tests */
  _editorFactory?: (container: HTMLElement) => Editor
  /** @internal — for tests */
  _wsConnect?: () => Promise<WelcomeFrame>
}

export interface MountHandle {
  save(): Promise<{ id: string }>
  exportXlsx(): Uint8Array
  destroy(): Promise<void>
  /**
   * Subscribe to remote mutations being applied to this editor. Fires AFTER the
   * Univer command service has finished applying the change locally. Consumers
   * like the side-panel preview use this to refresh derived views.
   * Returns an unsubscribe function.
   */
  onMutationApplied(cb: (seqNum: number, userId: string) => void): () => void
  /**
   * Subscribe to presence_update frames. Fires every time the server broadcasts
   * the room's roster (clientId → userId/cursor). Returns an unsubscribe function.
   */
  onPresence(cb: (entries: PresenceEntry[]) => void): () => void
  /**
   * Subscribe to save completions. Fires after any successful snapshot upload —
   * the manual `save()` call, the debounced auto-save, AND after applying a
   * remote mutation if `autoSaveMs` is on. Use this to refresh derived views.
   */
  onSaved(cb: (snapshotId: string) => void): () => void
  /** @internal — direct access to the WsClient; for tests and Playwright helpers */
  _wsClient: WsClient
}

export async function mountWorkbookEditor(opts: MountOpts): Promise<MountHandle> {
  const api = new ApiClient({
    baseUrl: opts.apiBaseUrl,
    token: opts.token,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  })
  // Load Univer locale resources BEFORE constructing the editor — they must be
  // passed to the Univer constructor or Ribbon and other UI components crash with
  // "Locale not initialized" on first render. Headless tests skip this via _editorFactory.
  const locales = opts._editorFactory ? undefined : await loadBrowserLocales()
  const editor = (
    opts._editorFactory ?? ((c) => createEditor({ container: c, ...(locales ? { locales } : {}) }))
  )(opts.container)
  const ws = new WsClient({ url: opts.wsBaseUrl, workbookId: opts.workbookId, token: opts.token })

  if (opts._wsConnect) {
    await opts._wsConnect()
  } else {
    /* v8 ignore next 2 — real WebSocket path; covered by T23 Playwright e2e */
    await ws.connect()
  }
  opts.onWsConnected?.(ws)

  // In a real browser, load UI plugins (canvas, toolbar, formula bar) before
  // creating the workbook unit. In jsdom / Node _univer is present but the
  // dynamic imports will silently fail — that's fine for headless tests.
  /* v8 ignore next 2 — browser-only plugin loading path */
  if (!opts._editorFactory) {
    await loadBrowserPlugins(editor._univer, opts.container)
  }

  const snapshot = await api.getLatestSnapshot(opts.workbookId)
  const sheetId = `s1-${opts.workbookId}`
  const data: UniverWorkbookData = snapshot ?? {
    id: opts.workbookId,
    sheetOrder: [sheetId],
    sheets: { [sheetId]: { id: sheetId, name: 'Sheet1', cellData: {} } },
  }
  editor.load(data)

  // Univer 0.22 UI plugins (sheets-ui, docs-ui) wire keyboard / focus listeners during
  // their onRendered phase, which runs AFTER createUnit kicks the renderer. Without a
  // tick to let that phase complete, the canvas accepts selection events but typing
  // never reaches the cell editor — EditorBridgeService has no listeners attached yet
  // when the first key is pressed.
  await new Promise((r) => setTimeout(r, 250))
  if (!opts._editorFactory) {
    const canvas = opts.container.querySelector('canvas') as HTMLCanvasElement | null
    canvas?.setAttribute('tabindex', '0')
    canvas?.focus({ preventScroll: true })
  }

  // ─── Realtime collaboration wiring ─────────────────────────────────────────
  // Each editor instance acquires a unique per-session lock (fallback) AND a
  // cell-region lock tied to the user's active cell selection. Mutations submit
  // with the cell-region — server rejects if another user owns that cell, which
  // is how we get true cell-level arbitration (not just last-write-wins).
  // Univer's CommandType.MUTATION + IExecutionOptions.fromCollab flag break the
  // echo loop between local capture and remote apply.
  const canEdit = opts.capabilities?.canEdit ?? true
  const sessionLockRegion = `auto-${cryptoRandomId()}`
  const cleanups: Array<() => void> = []

  // ─── Copy / print deterrence (D5) ─────────────────────────────────────────
  if (opts.preventCopy && !opts._editorFactory) {
    const doc = opts.container.ownerDocument
    const styleEl = doc.createElement('style')
    const cls = `ensemble-no-copy-${cryptoRandomId()}`
    opts.container.classList.add(cls)
    styleEl.textContent = `
.${cls} { user-select: none; -webkit-user-select: none; }
.${cls}.ensemble-window-hidden { filter: blur(8px); transition: filter 80ms; }
@media print { .${cls} { display: none !important; } }
`
    doc.head.appendChild(styleEl)
    const onVisibility = () => {
      if (doc.visibilityState === 'hidden') opts.container.classList.add('ensemble-window-hidden')
      else opts.container.classList.remove('ensemble-window-hidden')
    }
    doc.addEventListener('visibilitychange', onVisibility)
    cleanups.push(() => {
      doc.removeEventListener('visibilitychange', onVisibility)
      styleEl.remove()
      opts.container.classList.remove(cls, 'ensemble-window-hidden')
    })
  }

  // ─── Watermark overlay (best-effort leak deterrence) ──────────────────────
  // pointer-events:none, sits above canvas at z=5, removed by destroy() via cleanups.
  if (opts.watermark && !opts._editorFactory) {
    const wm = opts.watermark
    const opacity = wm.opacity ?? 0.08
    const color = wm.color ?? '#1f2937'
    const rotate = wm.rotateDeg ?? -22
    const watermarkEl = opts.container.ownerDocument.createElement('div')
    watermarkEl.setAttribute('aria-hidden', 'true')
    watermarkEl.dataset.ensembleWatermark = 'true'
    Object.assign(watermarkEl.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: '5',
      opacity: String(opacity),
      color,
      fontSize: '13px',
      fontFamily: 'system-ui, sans-serif',
      whiteSpace: 'nowrap',
      userSelect: 'none',
    } satisfies Partial<CSSStyleDeclaration>)
    // Build a repeating grid via 24 spans (6 rows x 4 cols).
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        const span = opts.container.ownerDocument.createElement('span')
        span.textContent = wm.text
        Object.assign(span.style, {
          position: 'absolute',
          top: `${r * 18}%`,
          left: `${c * 28}%`,
          transform: `rotate(${rotate}deg)`,
          transformOrigin: 'left top',
        } satisfies Partial<CSSStyleDeclaration>)
        watermarkEl.appendChild(span)
      }
    }
    const containerStyle = opts.container.style
    if (containerStyle.position === '' || containerStyle.position === 'static') {
      containerStyle.position = 'relative'
    }
    opts.container.appendChild(watermarkEl)
    cleanups.push(() => {
      watermarkEl.remove()
    })
  }
  const mutationAppliedListeners: Array<(seqNum: number, userId: string) => void> = []
  const presenceListeners: Array<(entries: PresenceEntry[]) => void> = []
  const savedListeners: Array<(snapshotId: string) => void> = []

  /**
   * The cell-region lock the user currently holds, derived from their active
   * Univer selection. Null before they first click a cell or whenever they
   * navigate away. Mutations prefer this region over the session-fallback so
   * server-side cell-level arbitration kicks in.
   */
  let currentCellRegion: string | null = null
  /**
   * True when our most recent attempt to acquire `currentCellRegion` was
   * denied by the server (another user owns it). beforeCommandExecuted reads
   * this to cancel local mutations targeting the locked cell — keeps the UI
   * from optimistically applying changes that the server will reject.
   */
  let cellLockBlocked = false
  /**
   * Owner of the cell the user currently has selected, when we don't own it
   * ourselves. Surfaced via lock_acquired events so CellLockOverlay shows
   * "X is editing here" without needing a separate broadcast.
   */
  let cellLockBlockedBy: string | null = null

  function makeCellRegion(
    unitId: string,
    subUnitId: string,
    row: number,
    col: number,
  ): string {
    return `cell:${unitId}/${subUnitId}!R${row}C${col}`
  }

  async function updateCellLock(newRegion: string | null): Promise<void> {
    if (newRegion === currentCellRegion) return
    if (currentCellRegion && ws.isConnected()) {
      // Fire-and-forget release; we don't care if it lands before the next
      // acquire because the server uses Redis SET-NX semantics.
      try {
        ws.releaseLock(currentCellRegion)
      } catch {
        /* socket may have closed */
      }
    }
    currentCellRegion = newRegion
    cellLockBlocked = false
    cellLockBlockedBy = null
    if (newRegion && canEdit && ws.isConnected()) {
      try {
        const result = await ws.acquireLock(newRegion)
        if (!result.acquired) {
          cellLockBlocked = true
          cellLockBlockedBy = result.ownerId
        }
      } catch (err) {
        console.warn('ensemble: cell lock acquire failed', err)
      }
    }
  }

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let autoSavePending = false
  async function performSave(): Promise<{ id: string }> {
    const snapshot = editor.getData()
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
    const snap = await api.uploadSnapshot(opts.workbookId, bytes, { reason: 'manual' })
    for (const cb of savedListeners) {
      try {
        cb(snap.id)
      } catch (err) {
        console.warn('ensemble: onSaved listener threw', err)
      }
    }
    return { id: snap.id }
  }
  function scheduleAutoSave(): void {
    const ms = opts.autoSaveMs ?? 0
    if (ms <= 0) return
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    autoSavePending = true
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null
      autoSavePending = false
      performSave().catch((err) => console.warn('ensemble: auto-save failed', err))
    }, ms)
  }

  // Bridge ws → external subscribers (must be set up regardless of canEdit, so
  // viewers see live changes broadcast from editors).
  cleanups.push(
    ws.onApplyMutation((frame) => {
      const payload = frame.payload as { id?: unknown; params?: unknown } | null
      if (
        editor.commandService &&
        payload &&
        typeof payload.id === 'string' &&
        typeof payload.params === 'object' &&
        payload.params !== null
      ) {
        editor.commandService
          .executeCommand(payload.id, payload.params as object, { fromCollab: true })
          .catch((err) => {
            console.warn('ensemble: failed to apply remote mutation', payload.id, err)
          })
      }
      for (const cb of mutationAppliedListeners) cb(frame.seqNum, frame.userId)
      // Auto-save after applying a remote change too — so the side-panel viewer
      // sees the merged state even though this client (often a non-author) isn't
      // typing. canEdit is required: viewer-token clients can't upload snapshots.
      if (canEdit) scheduleAutoSave()
    }),
  )

  cleanups.push(
    ws.onPresence((entries) => {
      for (const cb of presenceListeners) cb(entries)
    }),
  )

  if (canEdit && ws.isConnected()) {
    // Acquire session lock as a fallback for any mutation that fires before
    // the user has selected a specific cell (e.g., commands triggered from the
    // toolbar). Failure is non-fatal: subsequent submit_mutation frames will
    // be rejected by the server, surfaced as console warnings.
    try {
      await ws.acquireLock(sessionLockRegion)
    } catch (err) {
      console.warn('ensemble: session lock acquire failed', err)
    }

    if (editor.commandService) {
      // Cell-level lock arbitration: watch selection changes BEFORE Univer
      // applies them, so we acquire/release the cell lock in lockstep with
      // user intent. We also cancel local mutations if the server told us the
      // cell is owned by someone else — prevents the editor from drifting
      // ahead of the persisted truth.
      const beforeDispose = editor.commandService.beforeCommandExecuted((info) => {
        if (info.id === SET_SELECTIONS_OPERATION_ID) {
          const params = info.params as
            | {
                unitId?: unknown
                subUnitId?: unknown
                selections?: Array<{
                  range?: { startRow?: unknown; startColumn?: unknown }
                  primary?: { startRow?: unknown; startColumn?: unknown }
                }>
              }
            | undefined
          const unitId = typeof params?.unitId === 'string' ? params.unitId : null
          const subUnitId = typeof params?.subUnitId === 'string' ? params.subUnitId : null
          // Prefer primary cell (the anchored cell within a multi-cell range)
          // because that's where the cell editor opens; fall back to the first
          // cell of the first range.
          const first = params?.selections?.[0]
          const anchor = first?.primary ?? first?.range
          const row = typeof anchor?.startRow === 'number' ? anchor.startRow : null
          const col = typeof anchor?.startColumn === 'number' ? anchor.startColumn : null
          if (unitId && subUnitId && row !== null && col !== null) {
            void updateCellLock(makeCellRegion(unitId, subUnitId, row, col))
          }
          return
        }
        // Cancel local mutation if the server denied our cell lock. Throwing
        // CustomCommandExecutionError causes CommandService to return false
        // from executeCommand/syncExecuteCommand without firing the after-execute
        // listeners (so we don't accidentally broadcast a doomed mutation).
        if (info.type === COMMAND_TYPE_MUTATION && cellLockBlocked) {
          throw new CustomCommandExecutionError(
            `ensemble: cell locked by ${cellLockBlockedBy ?? 'another user'}`,
          )
        }
      })
      cleanups.push(() => beforeDispose.dispose())

      // Outbound: capture Univer mutations and send to server.
      const dispose = editor.commandService.onCommandExecuted((info, options) => {
        if (info.type !== COMMAND_TYPE_MUTATION) return
        if (options?.fromCollab) return
        if (options?.onlyLocal) return
        if (ws.isConnected()) {
          ws.submitMutation({
            // Use the cell-region we hold; fall back to the per-session lock
            // for cases where the user hasn't selected a cell yet (e.g. a
            // command fires synthetically right after mount).
            region: currentCellRegion ?? sessionLockRegion,
            payload: { id: info.id, params: info.params ?? {} },
          }).catch((err) => console.warn('ensemble: outbound mutation failed', info.id, err))
        }
        // Schedule debounced auto-save so the derived viewer-preview snapshot
        // catches up without the user hitting Save manually.
        scheduleAutoSave()
      })
      cleanups.push(() => dispose.dispose())
    }
  }

  // Keep our presence entry alive (server evicts after 15s idle). Fire once
  // immediately so the room roster sees us right after WS welcome.
  const heartbeatTimer = ws.isConnected()
    ? safeInterval(() => {
        try {
          ws.sendHeartbeat()
        } catch {
          /* socket may have closed mid-tick */
        }
      }, 5_000)
    : null
  if (ws.isConnected()) {
    try {
      ws.sendHeartbeat()
    } catch {
      /* socket may have closed already */
    }
  }

  return {
    async save() {
      // Manual save bypasses the auto-save debounce. Cancel any pending timer
      // so we don't immediately re-save after the user just pressed the button.
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
        autoSavePending = false
      }
      return performSave()
    },
    exportXlsx() {
      return univerJsonToXlsx(editor.getData())
    },
    async destroy() {
      if (heartbeatTimer) heartbeatTimer.clear()
      // Flush pending auto-save before tearing down so the user's last edits
      // aren't silently dropped on unmount.
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer)
        autoSaveTimer = null
      }
      if (autoSavePending) {
        autoSavePending = false
        try {
          await performSave()
        } catch (err) {
          console.warn('ensemble: final flush save failed', err)
        }
      }
      for (const cleanup of cleanups.splice(0)) {
        try {
          cleanup()
        } catch {
          /* swallow; tearing down anyway */
        }
      }
      if (canEdit && ws.isConnected()) {
        try {
          ws.releaseLock(sessionLockRegion)
        } catch {
          /* fire-and-forget */
        }
        if (currentCellRegion) {
          try {
            ws.releaseLock(currentCellRegion)
          } catch {
            /* fire-and-forget */
          }
          currentCellRegion = null
        }
      }
      editor.destroy()
      ws.close()
    },
    onMutationApplied(cb) {
      mutationAppliedListeners.push(cb)
      return () => {
        const i = mutationAppliedListeners.indexOf(cb)
        if (i >= 0) mutationAppliedListeners.splice(i, 1)
      }
    },
    onPresence(cb) {
      presenceListeners.push(cb)
      return () => {
        const i = presenceListeners.indexOf(cb)
        if (i >= 0) presenceListeners.splice(i, 1)
      }
    },
    onSaved(cb) {
      savedListeners.push(cb)
      return () => {
        const i = savedListeners.indexOf(cb)
        if (i >= 0) savedListeners.splice(i, 1)
      }
    },
    _wsClient: ws,
  }
}

function cryptoRandomId(): string {
  // crypto.randomUUID exists in modern browsers and Node ≥ 19. Fallback for
  // jsdom / older Node test environments uses Math.random — only used to build
  // a per-session lock region, never security-sensitive.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    /* fallthrough */
  }
  return `r${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

interface IntervalHandle {
  clear(): void
}

function safeInterval(fn: () => void, ms: number): IntervalHandle {
  const id = setInterval(fn, ms)
  return {
    clear() {
      clearInterval(id)
    },
  }
}

export { univerJsonToXlsx, xlsxToUniverJson }
