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
        ☁ 你正在 <strong>公共房间</strong>。你在这里写的内容当前对所有其他访客可见。
      </span>
      <div style={{ flex: 1 }} />
      <button type="button" onClick={onLeave}>
        ← 回我的沙盒
      </button>
    </div>
  )
}
