import { WorkbookEditor } from '@ensemble/react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function Pane({ userId }: { userId: string }) {
  const [wbId, setWbId] = useState<string | null>(localStorage.getItem('wbId-shared'))
  useEffect(() => {
    if (wbId) return
    void fetch('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: `Bearer dev:${userId}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Shared Demo' }),
    })
      .then((r) => r.json())
      .then((wb: { id: string }) => {
        localStorage.setItem('wbId-shared', wb.id)
        setWbId(wb.id)
      })
  }, [wbId, userId])
  if (!wbId) return <div style={{ padding: 16 }}>loading {userId}…</div>
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
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Pane userId="admin" />
      <Pane userId="viewer" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
