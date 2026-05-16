import { type ReactNode, useEffect } from 'react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
  children: ReactNode
  width?: number
}

/**
 * Minimal slide-over drawer. Backdrop click + Esc close. No external deps so the
 * demo build stays lean (Univer already pulls plenty).
 */
export function Drawer({
  open,
  onClose,
  side = 'left',
  title,
  children,
  width = 320,
}: DrawerProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape handled by document listener above
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.25)' }}
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no semantic action */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          ...(side === 'left' ? { left: 0 } : { right: 0 }),
          width,
          background: '#fff',
          borderRight: side === 'left' ? '1px solid #e5e7eb' : undefined,
          borderLeft: side === 'right' ? '1px solid #e5e7eb' : undefined,
          padding: 16,
          overflowY: 'auto',
          boxShadow: side === 'left' ? '2px 0 8px rgba(0,0,0,0.08)' : '-2px 0 8px rgba(0,0,0,0.08)',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} aria-label="关闭抽屉">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}
