import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CellLockOverlay } from '../src/CellLockOverlay'

function makeWsClient() {
  const listeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []
  return {
    onLockEvent: vi.fn((cb: (f: { type: string } & Record<string, unknown>) => void) => {
      listeners.push(cb)
      return () => { /* unsubscribe */ }
    }),
    _emit(f: { type: string } & Record<string, unknown>): void {
      for (const cb of listeners) cb(f)
    },
  }
}

describe('<CellLockOverlay />', () => {
  it('renders nothing when no locks', () => {
    const ws = makeWsClient()
    const { container } = render(<CellLockOverlay wsClient={ws as never} />)
    expect(container.querySelectorAll('.ensemble-lock-badge')).toHaveLength(0)
  })

  it('shows badge on lock_acquired', async () => {
    const ws = makeWsClient()
    const { findByText } = render(<CellLockOverlay wsClient={ws as never} />)
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await findByText('u-42 editing')
  })

  it('removes badge on lock_released', async () => {
    const ws = makeWsClient()
    const { findByText, queryByText } = render(<CellLockOverlay wsClient={ws as never} />)
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await findByText('u-42 editing')
    ws._emit({ type: 'lock_released', region: 'A1:A1' })
    await waitFor(() => expect(queryByText('u-42 editing')).toBeNull())
  })
})
