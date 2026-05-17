import { ApiClient, type MountHandle } from '@ensemble-sheets/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Toaster } from 'sonner'
import { useVisitor } from '../lib/visitor'
import { type Persona, capabilitiesFor } from '../persona'
import { FolderDrawer } from './FolderDrawer'
import { OnboardingCoach } from './OnboardingCoach'
import { PublicRoomBanner } from './PublicRoomBanner'
import { ShareDialog } from './ShareDialog'
import { SingleEditor } from './SingleEditor'
import { TopBar } from './TopBar'
import { VersionDrawer } from './VersionDrawer'
import { ViewerPreview } from './ViewerPreview'

export function DemoShell() {
  const state = useVisitor()
  const [inPublicRoom, setInPublicRoom] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [remountKey, setRemountKey] = useState(0)
  const [previewKey, setPreviewKey] = useState(0)
  const [pinnedWbId, setPinnedWbId] = useState<string | null>(null)

  if (state.status === 'loading') return <FullPageMessage>正在连接演示…</FullPageMessage>
  if (state.status === 'error')
    return (
      <FullPageMessage>
        演示当前不可用：<code>{state.message}</code>
        <br />
        请稍后刷新重试。
      </FullPageMessage>
    )

  const { visitor } = state
  const activeWbId = pinnedWbId ?? (inPublicRoom ? visitor.publicRoomWbId : visitor.sandboxWbId)
  const workbookLabel = inPublicRoom ? '公共房间' : pinnedWbId ? '已导入工作簿' : '我的沙盒'

  return (
    <>
      <Toaster
        position="top-right"
        richColors
        closeButton
        toastOptions={{ duration: 3500 }}
      />
      <Inner
      visitor={visitor}
      inPublicRoom={inPublicRoom}
      onTogglePublicRoom={() => {
        setPinnedWbId(null)
        setInPublicRoom((v) => !v)
        setPreviewKey((k) => k + 1)
      }}
      folderOpen={folderOpen}
      versionOpen={versionOpen}
      shareOpen={shareOpen}
      setFolderOpen={setFolderOpen}
      setVersionOpen={setVersionOpen}
      setShareOpen={setShareOpen}
      activeWbId={activeWbId}
      workbookLabel={workbookLabel}
      remountKey={remountKey}
      previewKey={previewKey}
      onRestored={() => {
        setRemountKey((k) => k + 1)
        setPreviewKey((k) => k + 1)
      }}
      onSaved={() => setPreviewKey((k) => k + 1)}
      onUploaded={(wbId) => {
        setInPublicRoom(false)
        setPinnedWbId(wbId)
        setRemountKey((k) => k + 1)
        setPreviewKey((k) => k + 1)
      }}
    />
    </>
  )
}

interface InnerProps {
  visitor: {
    userId: string
    persona: Persona
    sandboxWbId: string
    publicRoomWbId: string
  }
  inPublicRoom: boolean
  onTogglePublicRoom: () => void
  folderOpen: boolean
  versionOpen: boolean
  shareOpen: boolean
  setFolderOpen: (v: boolean) => void
  setVersionOpen: (v: boolean) => void
  setShareOpen: (v: boolean) => void
  activeWbId: string
  workbookLabel: string
  remountKey: number
  previewKey: number
  onRestored: () => void
  onSaved: () => void
  onUploaded: (wbId: string) => void
}

function Inner(p: InnerProps) {
  const token = `dev:${p.visitor.userId}`
  const api = useMemo(() => new ApiClient({ baseUrl: '', token: () => token }), [token])
  const handleRef = useRef<MountHandle | null>(null)
  const [handle, setHandle] = useState<MountHandle | null>(null)
  const capabilities = capabilitiesFor(p.visitor.persona)

  // Bump preview whenever the editor saves (manual or auto) or applies a remote
  // mutation — both signal the persisted snapshot may have changed, so the
  // side-panel viewer-preview should refetch.
  useEffect(() => {
    if (!handle) return undefined
    const unsubSaved = handle.onSaved(() => p.onSaved())
    const unsubMutation = handle.onMutationApplied(() => p.onSaved())
    return () => {
      unsubSaved()
      unsubMutation()
    }
  }, [handle, p])

  async function onSave() {
    if (!handleRef.current) return
    try {
      await handleRef.current.save()
      // onSaved handler already fires from inside performSave → onSaved listener,
      // so we don't double-bump here.
    } catch (e) {
      console.error('save failed', e)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <TopBar
        api={api}
        token={token}
        userId={p.visitor.userId}
        persona={p.visitor.persona}
        workbookId={p.activeWbId}
        workbookLabel={p.workbookLabel}
        inPublicRoom={p.inPublicRoom}
        onTogglePublicRoom={p.onTogglePublicRoom}
        onOpenFolders={() => p.setFolderOpen(true)}
        onOpenVersions={() => p.setVersionOpen(true)}
        onOpenShare={() => p.setShareOpen(true)}
        onSave={onSave}
        onUploaded={p.onUploaded}
        editorHandle={handle}
      />
      <PublicRoomBanner inPublicRoom={p.inPublicRoom} onLeave={p.onTogglePublicRoom} />
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <SingleEditor
          workbookId={p.activeWbId}
          userId={p.visitor.userId}
          persona={p.visitor.persona}
          remountKey={p.remountKey}
          onReady={(h) => {
            handleRef.current = h
            setHandle(h)
          }}
        />
        <ViewerPreview workbookId={p.activeWbId} refreshKey={p.previewKey} />
      </main>
      <FolderDrawer
        api={api}
        canEdit={capabilities.canEdit}
        open={p.folderOpen}
        onClose={() => p.setFolderOpen(false)}
        onSelect={(folder) => {
          console.log('selected folder', folder)
        }}
      />
      <VersionDrawer
        api={api}
        workbookId={p.activeWbId}
        open={p.versionOpen}
        onClose={() => p.setVersionOpen(false)}
        onRestore={p.onRestored}
      />
      <ShareDialog
        api={api}
        workbookId={p.activeWbId}
        open={p.shareOpen}
        onClose={() => p.setShareOpen(false)}
      />
      <OnboardingCoach />
    </div>
  )
}

function FullPageMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        fontSize: 14,
        color: '#374151',
      }}
    >
      <div style={{ maxWidth: 360, textAlign: 'center' }}>{children}</div>
    </div>
  )
}
