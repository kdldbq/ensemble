import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsStorage } from '../src/index'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ensemble-fs-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FsStorage', () => {
  it('put then get returns the same bytes', async () => {
    const s = new FsStorage({ root: dir })
    const b = new TextEncoder().encode('hi')
    await s.put('a/b.json', b)
    const back = await s.get('a/b.json')
    expect(new TextDecoder().decode(back)).toBe('hi')
  })
  it('delete makes get reject', async () => {
    const s = new FsStorage({ root: dir })
    await s.put('x', new Uint8Array([1, 2, 3]))
    await s.delete('x')
    await expect(s.get('x')).rejects.toThrow()
  })
  it('rejects path escapes', async () => {
    const s = new FsStorage({ root: dir })
    await expect(s.put('../escape', new Uint8Array([1]))).rejects.toThrow(/path/i)
  })
})
