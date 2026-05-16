import { describe, expect, it } from 'vitest'
import { capabilitiesFor, idToPersona, maskRulesFor } from '../src/persona'

describe('idToPersona', () => {
  it('maps explicit literals to themselves', () => {
    expect(idToPersona('admin')).toBe('admin')
    expect(idToPersona('editor')).toBe('editor')
    expect(idToPersona('viewer')).toBe('viewer')
  })

  it('respects role prefixes', () => {
    expect(idToPersona('admin-001')).toBe('admin')
    expect(idToPersona('editor-xyz')).toBe('editor')
    expect(idToPersona('viewer-foo-bar')).toBe('viewer')
  })

  it('is deterministic for unprefixed ids', () => {
    const id = 'visitor-7c4e8f6e-3a12-4ce3-9b1b-8fde6c2a01ab'
    const first = idToPersona(id)
    for (let i = 0; i < 5; i++) {
      expect(idToPersona(id)).toBe(first)
    }
  })

  it('distributes anonymous ids across all three personas', () => {
    const counts = { admin: 0, editor: 0, viewer: 0 }
    for (let i = 0; i < 600; i++) {
      counts[idToPersona(`anon-${i}`)]++
    }
    expect(counts.admin).toBeGreaterThan(100)
    expect(counts.editor).toBeGreaterThan(100)
    expect(counts.viewer).toBeGreaterThan(100)
  })
})

describe('capabilitiesFor', () => {
  it('grants admin everything', () => {
    expect(capabilitiesFor('admin')).toEqual({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: true,
    })
  })

  it('grants editor edit + share but not delete', () => {
    expect(capabilitiesFor('editor')).toEqual({
      canView: true,
      canEdit: true,
      canShare: true,
      canDelete: false,
    })
  })

  it('grants viewer view-only', () => {
    expect(capabilitiesFor('viewer')).toEqual({
      canView: true,
      canEdit: false,
      canShare: false,
      canDelete: false,
    })
  })
})

describe('maskRulesFor', () => {
  it('returns empty for admin and editor', () => {
    expect(maskRulesFor('admin')).toEqual([])
    expect(maskRulesFor('editor')).toEqual([])
  })

  it('redacts column B for viewer', () => {
    expect(maskRulesFor('viewer')).toEqual([
      {
        match: { type: 'column', sheet: '*', column: 'B' },
        action: { type: 'redact', replacement: '***' },
      },
    ])
  })
})
