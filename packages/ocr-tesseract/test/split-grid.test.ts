import { describe, expect, it } from 'vitest'
import { splitToGrid } from '../src/index'

describe('splitToGrid', () => {
  it('newlines → rows', () => {
    expect(splitToGrid('a\nb\nc')).toEqual([['a'], ['b'], ['c']])
  })

  it('multi-space → cols', () => {
    expect(splitToGrid('foo   bar    baz')).toEqual([['foo', 'bar', 'baz']])
  })

  it('tab → col', () => {
    expect(splitToGrid('a\tb\tc')).toEqual([['a', 'b', 'c']])
  })

  it('single space stays inside cell', () => {
    expect(splitToGrid('hello world')).toEqual([['hello world']])
  })

  it('mixed table', () => {
    const text = 'Name   Age   City\nAlice  30    NYC\nBob    25    SF'
    expect(splitToGrid(text)).toEqual([
      ['Name', 'Age', 'City'],
      ['Alice', '30', 'NYC'],
      ['Bob', '25', 'SF'],
    ])
  })

  it('skips blank lines', () => {
    expect(splitToGrid('a\n\n\nb')).toEqual([['a'], ['b']])
  })
})
