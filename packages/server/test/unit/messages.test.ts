import { describe, expect, it } from 'vitest'
import { parseInboundFrame } from '../../src/realtime/messages'

describe('parseInboundFrame', () => {
  it('acquire_lock', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'acquire_lock', region: 'A1:A1' })))
      .toEqual({ type: 'acquire_lock', region: 'A1:A1' })
  })
  it('submit_mutation', () => {
    expect(parseInboundFrame(JSON.stringify({
      type: 'submit_mutation', clientSeq: 5, region: 'A1:A1', payload: { op: 'set' },
    }))).toEqual({ type: 'submit_mutation', clientSeq: 5, region: 'A1:A1', payload: { op: 'set' } })
  })
  it('release_lock', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'release_lock', region: 'A1:A1' })))
      .toEqual({ type: 'release_lock', region: 'A1:A1' })
  })
  it('presence_heartbeat with cursor', () => {
    expect(parseInboundFrame(JSON.stringify({
      type: 'presence_heartbeat', cursor: { sheet: 's', row: 0, col: 0 },
    }))).toEqual({ type: 'presence_heartbeat', cursor: { sheet: 's', row: 0, col: 0 } })
  })
  it('malformed JSON → null', () => {
    expect(parseInboundFrame('{not json')).toBeNull()
  })
  it('unknown type → null', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'nope' }))).toBeNull()
  })
})
