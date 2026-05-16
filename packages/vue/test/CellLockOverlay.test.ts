import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CellLockOverlay from '../src/CellLockOverlay.vue'

function makeWsClient() {
  const listeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []
  return {
    onLockEvent: vi.fn((cb: (f: { type: string } & Record<string, unknown>) => void) => {
      listeners.push(cb)
      return () => {}
    }),
    _emit(f: { type: string } & Record<string, unknown>): void {
      for (const cb of listeners) cb(f)
    },
  }
}

describe('<CellLockOverlay /> Vue', () => {
  it('shows badge on lock_acquired', async () => {
    const ws = makeWsClient()
    const wrapper = mount(CellLockOverlay, { props: { wsClient: ws } })
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('u-42')
  })
  it('removes badge on lock_released', async () => {
    const ws = makeWsClient()
    const wrapper = mount(CellLockOverlay, { props: { wsClient: ws } })
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await wrapper.vm.$nextTick()
    ws._emit({ type: 'lock_released', region: 'A1:A1' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('u-42')
  })
})
