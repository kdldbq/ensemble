import { mountWorkbookEditor } from '@ensemble-sheets/core'
import type { MountHandle, WsClient } from '@ensemble-sheets/core'
import { useEffect, useRef } from 'react'

export interface WorkbookEditorProps {
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  className?: string
  style?: React.CSSProperties
  onReady?: (handle: MountHandle) => void
  /** Called immediately after WS connects (before plugins load). Use for WS-level helpers. */
  onWsConnected?: (ws: WsClient) => void
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

  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    void mountWorkbookEditor({
      container: ref.current,
      workbookId: props.workbookId,
      apiBaseUrl: props.apiBaseUrl,
      wsBaseUrl: props.wsBaseUrl,
      token: tokenRef.current,
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
  }, [props.workbookId, props.apiBaseUrl, props.wsBaseUrl])
  return (
    <div
      ref={ref}
      className={`ensemble-workbook-root ${props.className ?? ''}`}
      style={{ width: '100%', height: '100%', ...props.style }}
    />
  )
}
