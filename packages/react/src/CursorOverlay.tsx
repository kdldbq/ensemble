import type { MountHandle, PresenceEntry } from '@ensemble-sheets/core'
import { useEffect, useState } from 'react'

export interface CursorOverlayProps {
  handle: Pick<MountHandle, 'onPresence'> | null
  /** Local user id — their own cursor is suppressed. */
  selfUserId?: string | null
  /** Pixel rect of a cell, by (sheetId, row, col). If null, the cursor is hidden. */
  rectOf: (sheetId: string, row: number, col: number) => DOMRect | null
  /** Active sheet id. Cursors on other sheets are not rendered. */
  activeSheetId: string | null
  className?: string
}

interface RenderedCursor {
  clientId: string
  userId: string
  rect: DOMRect
  color: string
  label: string
}

/**
 * Remote-user cell-cursor overlay. Subscribes to MountHandle.onPresence and
 * paints a small colored frame + name flag over the cell each remote user is
 * currently on. Coordinate translation is delegated via `rectOf` because the
 * Univer instance owns the viewport math.
 */
export function CursorOverlay({
  handle,
  selfUserId,
  rectOf,
  activeSheetId,
  className,
}: CursorOverlayProps) {
  const [entries, setEntries] = useState<PresenceEntry[]>([])

  useEffect(() => {
    if (!handle) return undefined
    return handle.onPresence((next) => setEntries(next ?? []))
  }, [handle])

  const cursors: RenderedCursor[] = []
  for (const e of entries) {
    if (e.userId === selfUserId) continue
    const c = e.cursor
    if (!c || c.sheet !== activeSheetId) continue
    const rect = rectOf(c.sheet, c.row, c.col)
    if (!rect) continue
    cursors.push({
      clientId: e.clientId,
      userId: e.userId,
      rect,
      color: colorFromId(e.userId),
      label: e.userId,
    })
  }

  return (
    <div
      className={`ensemble-cursor-overlay ${className ?? ''}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden="true"
    >
      {cursors.map((c) => (
        <div
          key={c.clientId}
          style={{
            position: 'absolute',
            left: c.rect.left,
            top: c.rect.top,
            width: c.rect.width,
            height: c.rect.height,
            border: `2px solid ${c.color}`,
            boxSizing: 'border-box',
            borderRadius: 2,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -16,
              left: -2,
              padding: '0 4px',
              background: c.color,
              color: '#fff',
              fontSize: 10,
              lineHeight: '16px',
              borderRadius: '2px 2px 2px 0',
              whiteSpace: 'nowrap',
            }}
          >
            {c.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function colorFromId(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  const hue = ((h % 320) + 320) % 320
  return `hsl(${hue}, 65%, 50%)`
}
