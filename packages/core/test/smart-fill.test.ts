import { describe, expect, it } from 'vitest'
import { detectFillPattern, extendFill } from '../src/smart-fill'

describe('detectFillPattern', () => {
  it('detects arithmetic sequence', () => {
    expect(detectFillPattern([1, 2, 3])).toEqual({ kind: 'arithmetic', step: 1 })
    expect(detectFillPattern([10, 20, 30, 40])).toEqual({ kind: 'arithmetic', step: 10 })
    expect(detectFillPattern([5, 0, -5])).toEqual({ kind: 'arithmetic', step: -5 })
  })

  it('detects geometric sequence', () => {
    expect(detectFillPattern([2, 4, 8, 16])).toEqual({ kind: 'geometric', ratio: 2 })
    expect(detectFillPattern([1000, 100, 10])).toEqual({ kind: 'geometric', ratio: 0.1 })
  })

  it('detects date sequence (daily)', () => {
    const d1 = new Date('2026-01-01')
    const d2 = new Date('2026-01-02')
    const d3 = new Date('2026-01-03')
    const pattern = detectFillPattern([d1, d2, d3])
    expect(pattern.kind).toBe('date')
    if (pattern.kind === 'date') expect(pattern.stepMs).toBe(24 * 60 * 60 * 1000)
  })

  it('detects string-suffix sequence', () => {
    const pattern = detectFillPattern(['Q1', 'Q2', 'Q3'])
    expect(pattern).toEqual({
      kind: 'string-suffix',
      prefix: 'Q',
      start: 3,
      step: 1,
      width: 1,
    })
  })

  it('preserves zero-padding width', () => {
    const pattern = detectFillPattern(['item001', 'item002', 'item003'])
    expect(pattern).toMatchObject({ kind: 'string-suffix', width: 3 })
  })

  it('falls back to copy for mixed types', () => {
    expect(detectFillPattern([1, 'a', 3])).toEqual({ kind: 'copy' })
  })

  it('falls back to copy for non-uniform step', () => {
    expect(detectFillPattern([1, 2, 4, 7])).toEqual({ kind: 'copy' })
  })

  it('single-item seed → copy', () => {
    expect(detectFillPattern([42])).toEqual({ kind: 'copy' })
  })
})

describe('extendFill', () => {
  it('extends arithmetic', () => {
    expect(extendFill([1, 2, 3], 3)).toEqual([4, 5, 6])
  })

  it('extends geometric', () => {
    expect(extendFill([2, 4, 8], 2)).toEqual([16, 32])
  })

  it('extends dates', () => {
    const d1 = new Date('2026-01-01')
    const d2 = new Date('2026-01-02')
    const out = extendFill([d1, d2], 2) as Date[]
    expect(out[0]?.toISOString().slice(0, 10)).toBe('2026-01-03')
    expect(out[1]?.toISOString().slice(0, 10)).toBe('2026-01-04')
  })

  it('extends string-suffix', () => {
    expect(extendFill(['Q1', 'Q2'], 3)).toEqual(['Q3', 'Q4', 'Q5'])
    expect(extendFill(['item001', 'item002'], 2)).toEqual(['item003', 'item004'])
  })

  it('cycles for copy', () => {
    expect(extendFill(['a', 'b'], 5)).toEqual(['a', 'b', 'a', 'b', 'a'])
  })

  it('returns empty for non-positive count', () => {
    expect(extendFill([1, 2, 3], 0)).toEqual([])
    expect(extendFill([1, 2, 3], -1)).toEqual([])
  })
})
