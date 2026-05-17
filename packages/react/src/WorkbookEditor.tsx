import { type CollabCapability, mountWorkbookEditor } from '@ensemble-sheets/core'
import type { MountHandle, WsClient } from '@ensemble-sheets/core'
import { useEffect, useRef } from 'react'

export interface WorkbookWatermark {
  text: string
  opacity?: number
  color?: string
  rotateDeg?: number
}

export interface WorkbookEditorProps {
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  /**
   * Per-workbook capability hints. When `canEdit` is false, the editor enters
   * viewer mode (no outbound mutations, no session lock). The server still
   * enforces this independently — these flags only shape local UX.
   */
  capabilities?: CollabCapability
  /**
   * If positive, the editor auto-saves a snapshot N ms after the most recent
   * local mutation. Used by the demo's side-panel viewer-preview so derived
   * views update without manual saves. Default: 0 (off — manual save only).
   */
  autoSaveMs?: number
  className?: string
  style?: React.CSSProperties
  onReady?: (handle: MountHandle) => void
  /** Called immediately after WS connects (before plugins load). Use for WS-level helpers. */
  onWsConnected?: (ws: WsClient) => void
  /** Overlay watermark on canvas (best-effort; pointer-events:none). */
  watermark?: WorkbookWatermark
}

export function WorkbookEditor(props: WorkbookEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MountHandle | null>(null)
  // Stabilize mutable props via refs so token/onReady changes don't trigger remount
  const tokenRef = useRef(props.token)
  tokenRef.current = props.token
  const onReadyRef = useRef(props.onReady)
  onReadyRef.current = props.onReady
  const onWsConnectedRef = useRef(props.onWsConnected)
  onWsConnectedRef.current = props.onWsConnected

  // The ref pattern intentionally captures the LATEST onReady/onWsConnected
  // each render without remounting Univer, so the dep array deliberately omits
  // them. Biome would also like us to list `props.capabilities` (the object) as
  // a dependency, but we already track its primitive members instead.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    void mountWorkbookEditor({
      container: ref.current,
      workbookId: props.workbookId,
      apiBaseUrl: props.apiBaseUrl,
      wsBaseUrl: props.wsBaseUrl,
      token: tokenRef.current,
      ...(props.capabilities ? { capabilities: props.capabilities } : {}),
      ...(props.autoSaveMs !== undefined ? { autoSaveMs: props.autoSaveMs } : {}),
      ...(props.watermark ? { watermark: props.watermark } : {}),
      onWsConnected: (ws) => {
        if (!cancelled) onWsConnectedRef.current?.(ws)
      },
    }).then((h) => {
      if (cancelled) {
        void h.destroy()
        return
      }
      handleRef.current = h
      onReadyRef.current?.(h)
    })
    return () => {
      cancelled = true
      void handleRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    props.workbookId,
    props.apiBaseUrl,
    props.wsBaseUrl,
    props.capabilities?.canEdit,
    props.autoSaveMs,
  ])
  return (
    <div
      ref={ref}
      className={`ensemble-workbook-root ${props.className ?? ''}`}
      style={{ width: '100%', height: '100%', ...props.style }}
    />
  )
}
