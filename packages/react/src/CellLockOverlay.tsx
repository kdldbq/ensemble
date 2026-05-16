import type { WsClient } from '@ensemble/core'
import { useEffect, useState } from 'react'
import { LockBadge } from './LockBadge'

export interface CellLockOverlayProps {
  wsClient: Pick<WsClient, 'onLockEvent'>
  className?: string
}

export function CellLockOverlay({ wsClient, className }: CellLockOverlayProps) {
  const [locks, setLocks] = useState<Record<string, string>>({})

  useEffect(() => {
    return wsClient.onLockEvent((frame) => {
      if (frame.type === 'lock_acquired') {
        setLocks((prev) => ({ ...prev, [frame.region as string]: frame.ownerId as string }))
      } else if (frame.type === 'lock_released') {
        setLocks((prev) => {
          const next = { ...prev }
          delete next[frame.region as string]
          return next
        })
      }
    })
  }, [wsClient])

  return (
    <div className={`ensemble-cell-lock-overlay ${className ?? ''}`} aria-live="polite">
      {Object.entries(locks).map(([region, ownerId]) => (
        <div key={region} data-region={region} style={{ display: 'inline-block', marginRight: 8 }}>
          <span style={{ marginRight: 4, fontFamily: 'monospace' }}>{region}</span>
          <LockBadge ownerId={ownerId} />
        </div>
      ))}
    </div>
  )
}
