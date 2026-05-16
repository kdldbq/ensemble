// Univer base styles — required for toolbar, grid, and overlay layout.
// (Univer 0.22 ships CSS separately; consumers must import these.)
import '@univerjs/design/lib/index.css'
import '@univerjs/ui/lib/index.css'
import '@univerjs/docs-ui/lib/index.css'
import '@univerjs/sheets-ui/lib/index.css'

import { WsClient } from '@ensemble-sheets/core'
import { WorkbookEditor } from '@ensemble-sheets/react'
import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

function Pane({ userId, wbId }: { userId: string; wbId: string }) {
  const wsRef = useRef<WsClient | null>(null)

  // Connect a dedicated WsClient for Playwright e2e helpers.
  // This runs independently of the WorkbookEditor mount cycle so Univer
  // UI plugin crashes (LocaleService / Ribbon in headless mode) don't
  // prevent the lock helper from being bound.
  useEffect(() => {
    const ws = new WsClient({
      url: location.origin.replace('http', 'ws'),
      workbookId: wbId,
      token: () => `dev:${userId}`,
    })
    wsRef.current = ws
    void ws
      .connect()
      .then(() => {
        ;(window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${userId}`] = (
          region: string,
        ) => ws.acquireLock(region)
      })
      .catch(() => {
        /* ignore – not critical for UI */
      })
    return () => {
      ws.close()
      wsRef.current = null
      delete (window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${userId}`]
    }
  }, [wbId, userId])

  return (
    <div style={{ flex: 1, height: '100%', borderRight: '1px solid #eee' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
        user: <code>{userId}</code>
      </div>
      <WorkbookEditor
        workbookId={wbId}
        apiBaseUrl=""
        wsBaseUrl={location.origin.replace('http', 'ws')}
        token={() => `dev:${userId}`}
        onReady={(h) => {
          ;(window as unknown as Record<string, unknown>)[`ensembleSave_${userId}`] = () => h.save()
        }}
      />
    </div>
  )
}

function App() {
  const [wbId, setWbId] = useState<string | null>(localStorage.getItem('wbId-shared'))

  useEffect(() => {
    if (wbId) return
    void fetch('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:admin', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Shared Demo' }),
    })
      .then((r) => r.json())
      .then((wb: { id: string }) => {
        localStorage.setItem('wbId-shared', wb.id)
        setWbId(wb.id)
      })
  }, [wbId])

  if (!wbId) return <div style={{ padding: 16 }}>creating workbook…</div>
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Pane userId="admin" wbId={wbId} />
      <Pane userId="viewer" wbId={wbId} />
    </div>
  )
}

// Note: no <StrictMode> — Univer 0.22's internal bootstrap has a 300ms setTimeout
// race with disposal that StrictMode's intentional double-mount trips. Production
// builds don't run effects twice, so this is a dev-only concession.
createRoot(document.getElementById('root')!).render(<App />)
