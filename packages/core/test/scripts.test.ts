import { describe, expect, it } from 'vitest'
import { runScript } from '../src/scripts'

describe('runScript', () => {
  it('returns a script-computed value', async () => {
    const r = await runScript('return 2 + 3', { api: {} })
    expect(r.ok).toBe(true)
    expect(r.value).toBe(5)
  })

  it('exposes api callbacks as bare identifiers', async () => {
    const writes: Array<[string, unknown]> = []
    const r = await runScript('writeCell("A1", 42); return readCell("A1")', {
      api: {
        writeCell: (addr: unknown, v: unknown) => {
          writes.push([String(addr), v])
        },
        readCell: () => 42,
      },
    })
    expect(r.ok).toBe(true)
    expect(r.value).toBe(42)
    expect(writes).toEqual([['A1', 42]])
  })

  it('binds constants', async () => {
    const r = await runScript('return TENANT', { api: {}, constants: { TENANT: 't1' } })
    expect(r.value).toBe('t1')
  })

  it('reports parse errors', async () => {
    const r = await runScript('this is not js', { api: {} })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/parse error/i)
  })

  it('reports runtime errors', async () => {
    const r = await runScript('throw new Error("boom")', { api: {} })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('boom')
  })

  it('enforces timeout', async () => {
    const r = await runScript('await new Promise(() => {})', { api: {}, timeoutMs: 50 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/timed out/)
  })

  it('strict mode disallows undeclared global writes', async () => {
    const r = await runScript('rogue = 1; return rogue', { api: {} })
    expect(r.ok).toBe(false)
  })
})
