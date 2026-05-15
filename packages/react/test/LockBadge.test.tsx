import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LockBadge } from '../src/LockBadge'

describe('<LockBadge />', () => {
  it('shows owner + editing', () => {
    const { container } = render(<LockBadge ownerId="u-42" />)
    expect(container.textContent).toContain('u-42')
    expect(container.textContent).toMatch(/editing/i)
  })
  it('renders nothing when ownerId is empty', () => {
    const { container } = render(<LockBadge ownerId="" />)
    expect(container.querySelector('.ensemble-lock-badge')).toBeNull()
  })
})
