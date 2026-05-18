// biome-ignore-all lint/a11y/noStaticElementInteractions: Drawer overlay intentionally captures backdrop clicks; switching to a button would inflate keyboard tab order.
import { type ReactNode, useEffect, useId, useRef } from 'react'

export interface DrawerProps {
  open: boolean
  onClose: () => void
  side?: 'left' | 'right'
  title: string
  children: ReactNode
  width?: number
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Slide-over drawer with role=dialog, aria-modal=true, focus trap, and
 * return-focus-to-opener semantics. Backdrop click + Esc close.
 */
export function Drawer({
  open,
  onClose,
  side = 'left',
  title,
  children,
  width = 320,
}: DrawerProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null,
      )
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (!first || !last) return
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)

    const focusFirst = () => {
      const panel = panelRef.current
      if (!panel) return
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      first?.focus()
    }
    const t = window.setTimeout(focusFirst, 0)

    return () => {
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
      const opener = openerRef.current
      if (opener && typeof opener.focus === 'function') {
        opener.focus()
      }
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="presentation"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.25)' }}
      onClick={onClose}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only, no semantic action */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
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
          <strong id={titleId} style={{ fontSize: 14 }}>
            {title}
          </strong>
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
