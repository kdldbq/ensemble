// biome-ignore-all lint/style/noNonNullAssertion: test fixtures and statically-known DOM/array shapes are asserted by the test setup, not by runtime checks.
import { describe, expect, it } from 'vitest'
import { computePivot } from '../src/pivot'

const data = [
  { region: 'NA', product: 'A', qty: 3, revenue: 30 },
  { region: 'NA', product: 'B', qty: 5, revenue: 50 },
  { region: 'EU', product: 'A', qty: 7, revenue: 80 },
  { region: 'EU', product: 'A', qty: 2, revenue: 25 },
  { region: 'EU', product: 'B', qty: 4, revenue: 40 },
]

describe('computePivot', () => {
  it('sum aggregation', () => {
    const r = computePivot(data, {
      rows: ['region'],
      cols: ['product'],
      values: [{ field: 'qty', agg: 'sum' }],
    })
    expect(r.rowKeys).toEqual([['EU'], ['NA']])
    expect(r.colKeys).toEqual([['A'], ['B']])
    expect(r.cells[0]![0]![0]).toBe(9)
    expect(r.cells[0]![1]![0]).toBe(4)
    expect(r.cells[1]![0]![0]).toBe(3)
    expect(r.cells[1]![1]![0]).toBe(5)
  })

  it('count aggregation', () => {
    const r = computePivot(data, {
      rows: ['region'],
      cols: ['product'],
      values: [{ field: 'qty', agg: 'count' }],
    })
    expect(r.cells[0]![0]![0]).toBe(2)
    expect(r.cells[0]![1]![0]).toBe(1)
  })

  it('avg / min / max', () => {
    const r = computePivot(data, {
      rows: ['region'],
      cols: [],
      values: [
        { field: 'revenue', agg: 'avg' },
        { field: 'revenue', agg: 'min' },
        { field: 'revenue', agg: 'max' },
      ],
    })
    const eu = r.cells[0]![0]!
    expect(eu[0]).toBeCloseTo((80 + 25 + 40) / 3)
    expect(eu[1]).toBe(25)
    expect(eu[2]).toBe(80)
  })

  it('value headers reflect agg(field)', () => {
    const r = computePivot(data, {
      rows: ['region'],
      cols: ['product'],
      values: [
        { field: 'qty', agg: 'sum' },
        { field: 'revenue', agg: 'avg' },
      ],
    })
    expect(r.valueHeaders).toEqual(['sum(qty)', 'avg(revenue)'])
  })

  it('multi-row grouping sorted lex', () => {
    const r = computePivot(data, {
      rows: ['region', 'product'],
      cols: [],
      values: [{ field: 'qty', agg: 'sum' }],
    })
    expect(r.rowKeys).toEqual([
      ['EU', 'A'],
      ['EU', 'B'],
      ['NA', 'A'],
      ['NA', 'B'],
    ])
  })

  it('ignores non-numeric values', () => {
    const r = computePivot(
      [
        { region: 'NA', product: 'A', qty: 'abc' as unknown as number, revenue: 0 },
        { region: 'NA', product: 'A', qty: 5, revenue: 0 },
      ],
      {
        rows: ['region'],
        cols: ['product'],
        values: [{ field: 'qty', agg: 'sum' }],
      },
    )
    expect(r.cells[0]![0]![0]).toBe(5)
  })

  it('empty input → empty result', () => {
    const r = computePivot([], {
      rows: ['region'],
      cols: ['product'],
      values: [{ field: 'qty', agg: 'sum' }],
    })
    expect(r.rowKeys).toEqual([])
    expect(r.colKeys).toEqual([])
    expect(r.cells).toEqual([])
  })
})
