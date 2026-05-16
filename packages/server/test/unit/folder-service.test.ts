import { describe, expect, it } from 'vitest'
import { wouldCreateCycle } from '../../src/services/folder-service'

describe('wouldCreateCycle', () => {
  const tree = new Map<string, string | null>([
    ['root', null],
    ['a', 'root'],
    ['b', 'a'],
    ['c', 'b'],
  ])
  const parentOf = async (id: string) => tree.get(id) ?? null

  it('moving a into b creates a cycle', async () => {
    expect(await wouldCreateCycle('a', 'b', parentOf)).toBe(true)
  })
  it('moving a under root is fine', async () => {
    expect(await wouldCreateCycle('a', 'root', parentOf)).toBe(false)
  })
  it('moving a to null is fine', async () => {
    expect(await wouldCreateCycle('a', null, parentOf)).toBe(false)
  })
  it('moving a into itself is rejected', async () => {
    expect(await wouldCreateCycle('a', 'a', parentOf)).toBe(true)
  })
})
