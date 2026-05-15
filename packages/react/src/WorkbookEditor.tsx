import { mountWorkbookEditor } from '@ensemble/core'
import { type MountHandle } from '@ensemble/core'
import { useEffect, useRef } from 'react'

export interface WorkbookEditorProps {
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  className?: string
  style?: React.CSSProperties
  onReady?: (handle: MountHandle) => void
}

export function WorkbookEditor(props: WorkbookEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MountHandle | null>(null)
  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    void mountWorkbookEditor({
      container: ref.current,
      workbookId: props.workbookId,
      apiBaseUrl: props.apiBaseUrl,
      wsBaseUrl: props.wsBaseUrl,
      token: props.token,
    }).then((h) => {
      if (cancelled) { h.destroy(); return }
      handleRef.current = h
      props.onReady?.(h)
    })
    return () => {
      cancelled = true
      handleRef.current?.destroy()
    }
  }, [props.workbookId, props.apiBaseUrl, props.wsBaseUrl])
  return (
    <div
      ref={ref}
      className={`ensemble-workbook-root ${props.className ?? ''}`}
      style={{ width: '100%', height: '100%', ...props.style }}
    />
  )
}
