import { useEffect, useState } from 'react'

const STORAGE_KEY = 'ev_demo_onboarded'

/**
 * One-shot coachmark for first-time visitors. Stores a flag in localStorage so it
 * doesn't reappear after dismiss. Re-show by clearing the key in dev tools.
 */
export function OnboardingCoach() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.localStorage.getItem(STORAGE_KEY)) setShow(true)
  }, [])

  function dismiss() {
    window.localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        maxWidth: 360,
        background: '#0f172a',
        color: '#fff',
        padding: 16,
        borderRadius: 10,
        boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
        zIndex: 60,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 8 }}>👋 Welcome to the ensemble demo</div>
      <ol style={{ margin: 0, paddingLeft: 18 }}>
        <li>
          Edit any cell in the <em>admin</em> pane on the left.
        </li>
        <li>
          Watch the change propagate to the <em>viewer</em> pane on the right — column B stays
          masked as ***.
        </li>
        <li>
          Try <strong>📁 Folders</strong>, <strong>🕘 Versions</strong>,{' '}
          <strong>⬆ Upload .xlsx</strong>, and <strong>↗ Share</strong> in the toolbar.
        </li>
        <li>
          Click <strong>+ Open another user</strong> to spawn a fresh persona in a new tab.
        </li>
      </ol>
      <button type="button" onClick={dismiss} style={{ marginTop: 12 }}>
        Got it
      </button>
    </div>
  )
}
