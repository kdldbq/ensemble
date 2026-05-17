import type { MountHandle, PresenceEntry } from '@ensemble-sheets/core'
import { useEffect, useState } from 'react'

export interface PresenceAvatarsProps {
  /** The mount handle returned by mountWorkbookEditor / WorkbookEditor.onReady. */
  handle: Pick<MountHandle, 'onPresence'> | null
  /**
   * The local user's id, so we can suppress their own avatar from the bar (they
   * already know they're here). Pass null/undefined to show everyone.
   */
  selfUserId?: string | null
  /** Max avatars to render before showing "+N more". Default 5. */
  max?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Header strip that shows who else is currently in the room. Subscribes to the
 * MountHandle's presence stream so it updates as users join, leave, or move
 * their cursor. The server evicts stale entries after ~15s; this component just
 * mirrors what the server reports.
 */
export function PresenceAvatars({
  handle,
  selfUserId,
  max = 5,
  className,
  style,
}: PresenceAvatarsProps) {
  const [entries, setEntries] = useState<PresenceEntry[]>([])

  useEffect(() => {
    if (!handle) return undefined
    return handle.onPresence((next) => setEntries(next ?? []))
  }, [handle])

  const others = entries.filter((e) => e.userId !== selfUserId)
  const visible = others.slice(0, max)
  const overflow = others.length - visible.length

  if (others.length === 0) {
    return (
      <div className={`ensemble-presence-avatars ${className ?? ''}`} style={style}>
        <span style={{ color: '#9ca3af', fontSize: 12 }}>仅你一人</span>
      </div>
    )
  }

  return (
    <div
      className={`ensemble-presence-avatars ${className ?? ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, ...style }}
      aria-live="polite"
    >
      {visible.map((e) => (
        <Avatar key={e.clientId} userId={e.userId} />
      ))}
      {overflow > 0 && (
        <span
          style={{
            fontSize: 12,
            color: '#6b7280',
            padding: '2px 6px',
            background: '#f3f4f6',
            borderRadius: 999,
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}

function Avatar({ userId }: { userId: string }) {
  const color = colorFromId(userId)
  const initial = (userId[0] ?? '?').toUpperCase()
  return (
    <span
      title={userId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        borderRadius: '50%',
        background: color,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        boxShadow: '0 0 0 2px #fff',
      }}
    >
      {initial}
    </span>
  )
}

function colorFromId(id: string): string {
  // Stable color from userId. Avoid red (reserved for error toasts) and very
  // pale shades by clamping the hue to a designer-friendly range.
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const hue = ((h % 320) + 320) % 320
  return `hsl(${hue}, 60%, 45%)`
}
