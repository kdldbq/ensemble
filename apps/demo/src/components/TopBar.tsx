import type { ApiClient } from '@ensemble-sheets/core'
import { useRef, useState } from 'react'
import { openAnotherUserUrl } from '../lib/visitor'
import { downloadXlsx, uploadXlsx } from '../lib/xlsx-io'
import type { Persona } from '../persona'

export interface TopBarProps {
  api: ApiClient
  token: string
  userId: string
  persona: Persona
  workbookId: string
  workbookLabel: string
  inPublicRoom: boolean
  onTogglePublicRoom: () => void
  onOpenFolders: () => void
  onOpenVersions: () => void
  onOpenShare: () => void
  onUploaded: (workbookId: string) => void
}

const personaBadge: Record<Persona, { label: string; color: string }> = {
  admin: { label: 'Admin', color: '#0d9488' },
  editor: { label: 'Editor', color: '#2563eb' },
  viewer: { label: 'Viewer', color: '#9333ea' },
}

export function TopBar(props: TopBarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  function announce(msg: string) {
    setToast(msg)
    window.setTimeout(() => setToast(null), 3000)
  }

  async function handleUpload(file: File) {
    setBusy('upload')
    try {
      const { workbookId, name } = await uploadXlsx(props.api, file)
      announce(`✓ uploaded "${name}"`)
      props.onUploaded(workbookId)
    } catch (e) {
      announce(`✗ upload failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleDownload() {
    setBusy('download')
    try {
      await downloadXlsx('', props.token, props.workbookId, props.workbookLabel)
    } catch (e) {
      announce(`✗ download failed: ${(e as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  function handleOpenAnotherUser() {
    window.open(openAnotherUserUrl(), '_blank', 'noopener')
  }

  const badge = personaBadge[props.persona]

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderBottom: '1px solid #e5e7eb',
        background: '#fafafa',
        flexWrap: 'wrap',
        position: 'relative',
      }}
    >
      <strong style={{ fontSize: 14 }}>ensemble demo</strong>
      <span style={{ color: '#9ca3af', fontSize: 13 }}>· {props.workbookLabel}</span>

      <div style={{ flex: 1 }} />

      <button type="button" onClick={props.onOpenFolders}>
        📁 Folders
      </button>
      <button type="button" onClick={props.onOpenVersions}>
        🕘 Versions
      </button>
      <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}>
        ⬆ Upload .xlsx
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleUpload(f)
          e.target.value = ''
        }}
      />
      <button type="button" onClick={handleDownload} disabled={busy === 'download'}>
        ⬇ Download .xlsx
      </button>
      <button type="button" onClick={props.onOpenShare}>
        ↗ Share
      </button>
      <button type="button" onClick={props.onTogglePublicRoom}>
        {props.inPublicRoom ? '← My sandbox' : '☁ Public room'}
      </button>
      <button type="button" onClick={handleOpenAnotherUser}>
        + Open another user
      </button>

      <span
        title={`Your visitor id: ${props.userId}`}
        style={{
          background: badge.color,
          color: '#fff',
          padding: '2px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {badge.label}
      </span>

      {toast && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 12,
            background: '#1f2937',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 13,
            zIndex: 10,
          }}
        >
          {toast}
        </div>
      )}
    </header>
  )
}
