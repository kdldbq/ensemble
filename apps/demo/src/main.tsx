import { WorkbookEditor } from '@ensemble/react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [workbookId, setWorkbookId] = useState<string | null>(localStorage.getItem('wbId'))

  useEffect(() => {
    if (workbookId) return
    void fetch('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:u1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Demo' }),
    })
      .then((r) => r.json())
      .then((wb: { id: string }) => {
        localStorage.setItem('wbId', wb.id)
        setWorkbookId(wb.id)
      })
  }, [workbookId])

  if (!workbookId) return <div style={{ padding: 16 }}>loading…</div>
  return (
    <WorkbookEditor
      workbookId={workbookId}
      apiBaseUrl=""
      wsBaseUrl={location.origin.replace('http', 'ws')}
      token={() => 'dev:u1'}
      onReady={(h) => {
        ;(window as unknown as { ensembleSave: () => Promise<unknown> }).ensembleSave = () => h.save()
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
