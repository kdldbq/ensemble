// biome-ignore-all lint/style/noNonNullAssertion: test fixtures and statically-known DOM/array shapes are asserted by the test setup, not by runtime checks.
import { describe, expect, it } from 'vitest'
import { formatCrossRef, parseCrossRef, resolveCrossRef } from '../src/cross-ref'

describe('parseCrossRef', () => {
  it('parses bare cell', () => {
    expect(parseCrossRef('A1')).toEqual({ rangeRef: 'A1', isRelative: true })
  })

  it('parses bare range', () => {
    expect(parseCrossRef('A1:C10')).toEqual({ rangeRef: 'A1:C10', isRelative: true })
  })

  it('parses column-only and row-only ranges', () => {
    expect(parseCrossRef('A:A')).toMatchObject({ rangeRef: 'A:A' })
    expect(parseCrossRef('1:1')).toMatchObject({ rangeRef: '1:1' })
  })

  it('parses sheet-qualified', () => {
    const r = parseCrossRef('Sheet1!A1:B10')
    expect(r).toEqual({ sheetName: 'Sheet1', rangeRef: 'A1:B10', isRelative: false })
  })

  it('parses quoted sheet with space', () => {
    const r = parseCrossRef("'Q1 2026'!A1")
    expect(r).toEqual({ sheetName: 'Q1 2026', rangeRef: 'A1', isRelative: false })
  })

  it('unescapes doubled apostrophes in quoted sheet', () => {
    const r = parseCrossRef("'Bob''s Sheet'!A1")
    expect(r).toEqual({ sheetName: "Bob's Sheet", rangeRef: 'A1', isRelative: false })
  })

  it('parses workbook-qualified', () => {
    const r = parseCrossRef('[Budget]Sheet1!A1')
    expect(r).toEqual({
      workbookName: 'Budget',
      sheetName: 'Sheet1',
      rangeRef: 'A1',
      isRelative: false,
    })
  })

  it('lowercases column letters → upper', () => {
    expect(parseCrossRef('a1:c10')?.rangeRef).toBe('A1:C10')
  })

  it('returns null on empty + garbage', () => {
    expect(parseCrossRef('')).toBeNull()
    expect(parseCrossRef('Sheet1!ZZZ-FOO')).toBeNull()
  })
})

describe('formatCrossRef', () => {
  it('round-trips simple refs', () => {
    expect(formatCrossRef({ rangeRef: 'A1', isRelative: true })).toBe('A1')
    expect(formatCrossRef({ sheetName: 'Sheet1', rangeRef: 'A1', isRelative: false })).toBe(
      'Sheet1!A1',
    )
  })

  it('auto-quotes sheet names with spaces', () => {
    expect(formatCrossRef({ sheetName: 'Q1 2026', rangeRef: 'A1', isRelative: false })).toBe(
      "'Q1 2026'!A1",
    )
  })

  it('escapes apostrophes', () => {
    expect(formatCrossRef({ sheetName: "Bob's Sheet", rangeRef: 'A1', isRelative: false })).toBe(
      "'Bob''s Sheet'!A1",
    )
  })
})

describe('resolveCrossRef', () => {
  const ctx = {
    currentWorkbookId: 'wb-current',
    currentSheetId: 'sheet-current',
    workbooksByName: new Map([
      ['Budget', 'wb-budget'],
      ['Forecast', 'wb-forecast'],
    ]),
    sheetsByNameInCurrent: new Map([
      ['Sheet1', 'sheet-1'],
      ['Q1 2026', 'sheet-q1'],
    ]),
    sheetsByNameInWorkbook: (wbId: string) =>
      wbId === 'wb-budget' ? new Map([['Summary', 'budget-summary']]) : new Map(),
  }

  it('resolves relative ref to current sheet', () => {
    const ref = parseCrossRef('A1:B2')!
    expect(resolveCrossRef(ref, ctx)).toEqual({
      workbookId: 'wb-current',
      sheetId: 'sheet-current',
      rangeRef: 'A1:B2',
    })
  })

  it('resolves sheet-qualified ref', () => {
    const ref = parseCrossRef('Sheet1!C5')!
    expect(resolveCrossRef(ref, ctx)).toEqual({
      workbookId: 'wb-current',
      sheetId: 'sheet-1',
      rangeRef: 'C5',
    })
  })

  it('resolves cross-workbook ref', () => {
    const ref = parseCrossRef('[Budget]Summary!A1:Z100')!
    expect(resolveCrossRef(ref, ctx)).toEqual({
      workbookId: 'wb-budget',
      sheetId: 'budget-summary',
      rangeRef: 'A1:Z100',
    })
  })

  it('returns null on unknown workbook', () => {
    const ref = parseCrossRef('[Nonexistent]Sheet1!A1')!
    expect(resolveCrossRef(ref, ctx)).toBeNull()
  })

  it('returns null on unknown sheet', () => {
    const ref = parseCrossRef('Missing!A1')!
    expect(resolveCrossRef(ref, ctx)).toBeNull()
  })

  it('case-insensitive sheet name lookup', () => {
    const ref = parseCrossRef('SHEET1!A1')!
    expect(resolveCrossRef(ref, ctx)?.sheetId).toBe('sheet-1')
  })
})
