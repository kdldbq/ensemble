import { ApiClient } from '@ensemble-sheets/core'
import { useMemo, useState } from 'react'
import { useVisitor } from '../lib/visitor'
import type { Persona } from '../persona'
import { EditorPair } from './EditorPair'
import { FolderDrawer } from './FolderDrawer'
import { OnboardingCoach } from './OnboardingCoach'
import { PublicRoomBanner } from './PublicRoomBanner'
import { ShareDialog } from './ShareDialog'
import { TopBar } from './TopBar'
import { VersionDrawer } from './VersionDrawer'

/**
 * Returns the persona that should sit in the right pane next to the visitor's left
 * persona — picked to maximize visible contrast (mask + capability diff).
 */
function contrastingPersona(left: Persona): Persona {
  if (left === 'admin' || left === 'editor') return 'viewer'
  return 'admin'
}

export function DemoShell() {
  const state = useVisitor()
  const [inPublicRoom, setInPublicRoom] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)
  const [versionOpen, setVersionOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [remountKey, setRemountKey] = useState(0)
  const [pinnedWbId, setPinnedWbId] = useState<string | null>(null)

  if (state.status === 'loading') return <FullPageMessage>Connecting to demo…</FullPageMessage>
  if (state.status === 'error')
    return (
      <FullPageMessage>
        Demo currently unreachable: <code>{state.message}</code>
        <br />
        Try refreshing in a moment.
      </FullPageMessage>
    )

  const { visitor } = state
  const activeWbId = pinnedWbId ?? (inPublicRoom ? visitor.publicRoomWbId : visitor.sandboxWbId)
  const workbookLabel = inPublicRoom
    ? 'Public room'
    : pinnedWbId
      ? 'Imported workbook'
      : 'My sandbox'

  return (
    <Inner
      visitor={visitor}
      inPublicRoom={inPublicRoom}
      onTogglePublicRoom={() => {
        setPinnedWbId(null)
        setInPublicRoom((v) => !v)
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
      onRestored={() => setRemountKey((k) => k + 1)}
      onUploaded={(wbId) => {
        setInPublicRoom(false)
        setPinnedWbId(wbId)
        setRemountKey((k) => k + 1)
      }}
    />
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
  onRestored: () => void
  onUploaded: (wbId: string) => void
}

function Inner(p: InnerProps) {
  const token = `dev:${p.visitor.userId}`
  const api = useMemo(() => new ApiClient({ baseUrl: '', token: () => token }), [token])
  const rightPersona = contrastingPersona(p.visitor.persona)
  // Stable contrasting partner id; the partner is just there to demonstrate the live
  // multi-user + mask diff alongside the visitor's own pane.
  const rightUserId = `${rightPersona}-pair`

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
        onUploaded={p.onUploaded}
      />
      <PublicRoomBanner inPublicRoom={p.inPublicRoom} onLeave={p.onTogglePublicRoom} />
      <main style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <EditorPair
          workbookId={p.activeWbId}
          leftUserId={p.visitor.userId}
          leftPersona={p.visitor.persona}
          rightUserId={rightUserId}
          rightPersona={rightPersona}
          remountKey={p.remountKey}
        />
      </main>
      <FolderDrawer
        api={api}
        open={p.folderOpen}
        onClose={() => p.setFolderOpen(false)}
        onSelect={(folder) => {
          // Folder selection just acknowledges for now — a folder→workbook listing UI is
          // out of scope for this showcase; the create/rename CRUD inside the panel is
          // what visitors are meant to experience.
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
