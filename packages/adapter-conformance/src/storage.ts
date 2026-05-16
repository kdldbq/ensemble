import type { StorageAdapter } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export function runStorageConformance(name: string, adapterFactory: () => StorageAdapter): void {
  describe(`StorageAdapter conformance: ${name}`, () => {
    it('put then get round-trips bytes', async () => {
      const a = adapterFactory()
      const key = 'conformance/' + Math.random().toString(36).slice(2)
      await a.put(key, new TextEncoder().encode('hello'))
      const back = await a.get(key)
      expect(new TextDecoder().decode(back)).toBe('hello')
      await a.delete(key)
    })
    it('delete then get throws or returns empty', async () => {
      const a = adapterFactory()
      const key = 'conformance/' + Math.random().toString(36).slice(2)
      await a.put(key, new Uint8Array([1, 2, 3]))
      await a.delete(key)
      let threw = false; let len = -1
      try { const back = await a.get(key); len = back.byteLength } catch { threw = true }
      expect(threw || len === 0).toBe(true)
    })
  })
}
