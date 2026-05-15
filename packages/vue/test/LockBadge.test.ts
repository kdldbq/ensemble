import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LockBadge from '../src/LockBadge.vue'

describe('<LockBadge /> Vue', () => {
  it('renders owner id', () => {
    const w = mount(LockBadge, { props: { ownerId: 'u-99' } })
    expect(w.text()).toContain('u-99')
    expect(w.text()).toMatch(/editing/i)
  })
  it('hides when ownerId empty', () => {
    const w = mount(LockBadge, { props: { ownerId: '' } })
    expect(w.element.querySelector('.ensemble-lock-badge')).toBeNull()
  })
})
