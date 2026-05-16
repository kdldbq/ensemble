import type { WsClient } from '@ensemble-sheets/core'
import { WorkbookEditor } from '@ensemble-sheets/react'
import { useEffect, useRef } from 'react'
import type { Persona } from '../persona'

export interface EditorPairProps {
  workbookId: string
  leftUserId: string
  leftPersona: Persona
  rightUserId: string
  rightPersona: Persona
  /**
   * Bumped by parent (e.g., after restoring a version) to force-remount both editors
   * with fresh state.
   */
  remountKey: number
}

const personaLabel: Record<Persona, string> = {
  admin: 'admin',
  editor: 'editor',
  viewer: 'viewer (column B masked)',
}

const personaTint: Record<Persona, string> = {
  admin: '#ecfdf5',
  editor: '#eff6ff',
  viewer: '#faf5ff',
}

export function EditorPair(props: EditorPairProps) {
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
      <Pane
        side="left"
        userId={props.leftUserId}
        persona={props.leftPersona}
        workbookId={props.workbookId}
        remountKey={props.remountKey}
      />
      <Pane
        side="right"
        userId={props.rightUserId}
        persona={props.rightPersona}
        workbookId={props.workbookId}
        remountKey={props.remountKey}
      />
    </div>
  )
}

interface PaneProps {
  side: 'left' | 'right'
  userId: string
  persona: Persona
  workbookId: string
  remountKey: number
}

function Pane({ side, userId, persona, workbookId, remountKey }: PaneProps) {
  const wsRef = useRef<WsClient | null>(null)

  // Stash a WS-level lock helper on window so e2e specs can call
  // window.ensembleAcquireLock_<userId>(region) — preserves the previous demo's API.
  useEffect(() => {
    return () => {
      wsRef.current = null
      delete (window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${userId}`]
      delete (window as unknown as Record<string, unknown>)[`ensembleSave_${userId}`]
    }
  }, [userId])

  return (
    <div
      key={`${userId}-${workbookId}-${remountKey}`}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        borderRight: side === 'left' ? '1px solid #e5e7eb' : undefined,
        background: personaTint[persona],
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
        }}
      >
        <strong>{personaLabel[persona]}</strong>
        <span style={{ color: '#9ca3af' }}>· {userId}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <WorkbookEditor
          workbookId={workbookId}
          apiBaseUrl=""
          wsBaseUrl={location.origin.replace('http', 'ws')}
          token={() => `dev:${userId}`}
          onWsConnected={(ws) => {
            wsRef.current = ws
            ;(window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${userId}`] = (
              region: string,
            ) => ws.acquireLock(region)
          }}
          onReady={(h) => {
            ;(window as unknown as Record<string, unknown>)[`ensembleSave_${userId}`] = () =>
              h.save()
          }}
        />
      </div>
    </div>
  )
}
