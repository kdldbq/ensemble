export interface PublicRoomBannerProps {
  inPublicRoom: boolean
  onLeave: () => void
}

export function PublicRoomBanner({ inPublicRoom, onLeave }: PublicRoomBannerProps) {
  if (!inPublicRoom) return null
  return (
    <div
      style={{
        background: '#fef3c7',
        color: '#78350f',
        padding: '6px 12px',
        fontSize: 13,
        borderBottom: '1px solid #fde68a',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span>
        ☁ You are in the <strong>public room</strong>. Anything you type here is visible to every
        other visitor right now.
      </span>
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onLeave}>
        ← Back to my sandbox
      </button>
    </div>
  )
}
