import { describe, expect, it, vi } from 'vitest'
import type { MaskRule } from '../../src/adapters/types'
import { MaskRuleCache, applyMaskRules } from '../../src/services/mask-service'

function wb() {
  return {
    id: 'wb',
    sheetOrder: ['s1'],
    sheets: {
      s1: {
        id: 's1',
        name: 'Grades',
        cellData: {
          '0': { '0': { v: 'name' }, '1': { v: 'score' }, '2': { v: 'subject' } },
          '1': { '0': { v: 'Alice' }, '1': { v: 90 }, '2': { v: 'math' } },
          '2': { '0': { v: 'Bob' }, '1': { v: 85 }, '2': { v: 'physics' } },
        },
      },
    },
  }
}

describe('applyMaskRules', () => {
  it('column rule + redact', () => {
    const rules: MaskRule[] = [
      {
        match: { type: 'column', sheet: '*', column: 'B' },
        action: { type: 'redact', replacement: '***' },
      },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe('***')
    expect(out.sheets.s1.cellData['2']['1'].v).toBe('***')
    expect(out.sheets.s1.cellData['1']['0'].v).toBe('Alice')
  })

  it('header rule resolves column via row 0', () => {
    const rules: MaskRule[] = [
      { match: { type: 'header', sheet: 'Grades', headerText: 'score' }, action: { type: 'hash' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(typeof out.sheets.s1.cellData['1']['1'].v).toBe('string')
    expect(out.sheets.s1.cellData['1']['1'].v).toMatch(/^#[a-f0-9]{8}$/)
  })

  it('row rule + remove nulls cell values where predicate matches', () => {
    const rules: MaskRule[] = [
      {
        match: { type: 'row', sheet: '*', where: { field: 'subject', op: 'eq', value: 'math' } },
        action: { type: 'remove' },
      },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['0'].v).toBeNull()
    expect(out.sheets.s1.cellData['2']['0'].v).toBe('Bob')
  })

  it('non-existing header is a no-op', () => {
    const rules: MaskRule[] = [
      {
        match: { type: 'header', sheet: '*', headerText: 'nope' },
        action: { type: 'redact', replacement: 'X' },
      },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe(90)
  })

  it('sheet "*" applies to all sheets', () => {
    const data = wb()
    data.sheetOrder.push('s2')
    data.sheets.s2 = {
      id: 's2',
      name: 'Roster',
      cellData: { '0': { '0': { v: 'x' } } },
    }
    const rules: MaskRule[] = [
      {
        match: { type: 'column', sheet: '*', column: 'A' },
        action: { type: 'redact', replacement: '_' },
      },
    ]
    const out = applyMaskRules(data, rules)
    expect(out.sheets.s1.cellData['0']['0'].v).toBe('_')
    expect(out.sheets.s2.cellData['0']['0'].v).toBe('_')
  })

  it('rules accumulate left-to-right', () => {
    const rules: MaskRule[] = [
      {
        match: { type: 'column', sheet: '*', column: 'B' },
        action: { type: 'redact', replacement: 'first' },
      },
      {
        match: { type: 'column', sheet: '*', column: 'B' },
        action: { type: 'redact', replacement: 'second' },
      },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe('second')
  })
})

describe('MaskRuleCache', () => {
  it('caches by (userId, workbookId)', async () => {
    const fetcher = vi.fn(
      async (): Promise<MaskRule[]> => [
        { match: { type: 'column', sheet: '*', column: 'A' }, action: { type: 'remove' } },
      ],
    )
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get({ tenantId: 't', userId: 'u1' }, 'wb1')
    await cache.get({ tenantId: 't', userId: 'u1' }, 'wb1')
    await cache.get({ tenantId: 't', userId: 'u2' }, 'wb1')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('expires after TTL', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (): Promise<MaskRule[]> => [])
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get({ tenantId: 't', userId: 'u' }, 'wb')
    vi.advanceTimersByTime(60_001)
    await cache.get({ tenantId: 't', userId: 'u' }, 'wb')
    expect(fetcher).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('invalidate drops the entry', async () => {
    const fetcher = vi.fn(async (): Promise<MaskRule[]> => [])
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get({ tenantId: 't', userId: 'u' }, 'wb')
    cache.invalidate({ tenantId: 't', userId: 'u' }, 'wb')
    await cache.get({ tenantId: 't', userId: 'u' }, 'wb')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
