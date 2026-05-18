import type { MountHandle, WsClient } from '@ensemble-sheets/core'
import { CellLockOverlay, WorkbookEditor } from '@ensemble-sheets/react'
import { useEffect, useRef, useState } from 'react'
import { capabilitiesFor, type Persona } from '../persona'

export interface SingleEditorProps {
  workbookId: string
  userId: string
  persona: Persona
  /**
   * Bumped by parent (e.g., after restoring a version) to force-remount the editor
   * with fresh state.
   */
  remountKey: number
  onReady?: (handle: MountHandle) => void
}

const personaLabel: Record<Persona, string> = {
  admin: '管理员（可编辑、可分享）',
  editor: '编辑者（可编辑）',
  viewer: '查看者（只读，B 列脱敏）',
}

const personaTint: Record<Persona, string> = {
  admin: '#ecfdf5',
  editor: '#eff6ff',
  viewer: '#faf5ff',
}

/**
 * Single Univer editor pane. Only one of these may be mounted per page because
 * Univer 0.22 keeps global keyboard / shortcut state per page; a second instance
 * silently captures keystrokes from the first. The viewer-side mask demo is
 * served by a separate static-HTML ViewerPreview component.
 */
export function SingleEditor(props: SingleEditorProps) {
  const wsRef = useRef<WsClient | null>(null)
  const handleRef = useRef<MountHandle | null>(null)
  const [wsClient, setWsClient] = useState<WsClient | null>(null)

  const cap = capabilitiesFor(props.persona)

  useEffect(() => {
    return () => {
      wsRef.current = null
      handleRef.current = null
      setWsClient(null)
      delete (window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${props.userId}`]
      delete (window as unknown as Record<string, unknown>)[`ensembleSave_${props.userId}`]
    }
  }, [props.userId])

  return (
    <div
      key={`${props.userId}-${props.workbookId}-${props.remountKey}`}
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        background: personaTint[props.persona],
      }}
    >
      <div
        style={{
          padding: '6px 12px',
          borderBottom: '1px solid #e5e7eb',
          fontSize: 12,
          color: '#374151',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <strong>{personaLabel[props.persona]}</strong>
        <span style={{ color: '#9ca3af' }}>· {props.userId}</span>
        {!cap.canEdit && (
          <span
            style={{
              background: '#fef3c7',
              color: '#92400e',
              padding: '1px 8px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            只读模式
          </span>
        )}
        {wsClient && (
          <span style={{ marginLeft: 'auto' }}>
            <CellLockOverlay wsClient={wsClient} />
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkbookEditor
          workbookId={props.workbookId}
          apiBaseUrl=""
          wsBaseUrl={location.origin.replace('http', 'ws')}
          token={() => `dev:${props.userId}`}
          capabilities={{ canEdit: cap.canEdit }}
          autoSaveMs={cap.canEdit ? 800 : 0}
          watermark={{
            text: `${props.userId} · ${new Date().toISOString().slice(0, 10)}`,
            opacity: 0.06,
          }}
          onWsConnected={(ws) => {
            wsRef.current = ws
            setWsClient(ws)
            ;(window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${props.userId}`] =
              (region: string) => ws.acquireLock(region)
          }}
          onReady={(h) => {
            handleRef.current = h
            ;(window as unknown as Record<string, unknown>)[`ensembleSave_${props.userId}`] = () =>
              h.save()
            props.onReady?.(h)
          }}
        />
      </div>
    </div>
  )
}
