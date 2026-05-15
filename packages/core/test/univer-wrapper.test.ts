import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/univer-wrapper'

describe('createEditor', () => {
  it('is a function', () => {
    expect(typeof createEditor).toBe('function')
  })

  it('returns handle with load / getData / destroy functions', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ed = createEditor({ container })
    expect(typeof ed.load).toBe('function')
    expect(typeof ed.getData).toBe('function')
    expect(typeof ed.destroy).toBe('function')
    ed.destroy()
  })
})
