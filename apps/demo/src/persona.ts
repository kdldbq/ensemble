/**
 * Persona derivation for the public demo.
 *
 * The demo's PermissionAdapter is a pure function of the visitor's userId — no DB lookup.
 * Persona is decided either by an explicit prefix ("admin-..." / "editor-..." / "viewer-...")
 * or by a deterministic hash of the userId so that distribution is roughly even across
 * anonymous visitors. The same userId always resolves to the same persona; reloads
 * preserve the experience.
 */

import type { Capability, MaskRule } from '@ensemble-sheets/server'

export type Persona = 'admin' | 'editor' | 'viewer'

const PERSONAS: readonly Persona[] = ['admin', 'editor', 'viewer'] as const

/**
 * Derive persona from userId.
 *
 * - Explicit literals `admin`, `editor`, `viewer` map to themselves (useful for dev /
 *   e2e fixtures that pass `dev:admin` etc.).
 * - IDs prefixed `admin-`, `editor-`, `viewer-` map to the corresponding persona
 *   (e.g., `admin-test-1` → admin). Used by the "open another user" link generator.
 * - All other IDs are hashed (FNV-1a 32-bit) and mapped modulo 3.
 */
export function idToPersona(userId: string): Persona {
  if (userId === 'admin' || userId === 'editor' || userId === 'viewer') {
    return userId
  }
  if (userId.startsWith('admin-')) return 'admin'
  if (userId.startsWith('editor-')) return 'editor'
  if (userId.startsWith('viewer-')) return 'viewer'
  const idx = fnv1a32(userId) % PERSONAS.length
  return PERSONAS[idx] as Persona
}

export function capabilitiesFor(persona: Persona): Capability {
  switch (persona) {
    case 'admin':
      return { canView: true, canEdit: true, canShare: true, canDelete: true }
    case 'editor':
      return { canView: true, canEdit: true, canShare: true, canDelete: false }
    case 'viewer':
      return { canView: true, canEdit: false, canShare: false, canDelete: false }
  }
}

/**
 * Viewer sees column B redacted; admin / editor see raw values. The demo seeds workbooks
 * with a label in column B so the difference is obvious at a glance.
 */
export function maskRulesFor(persona: Persona): MaskRule[] {
  if (persona !== 'viewer') return []
  return [
    {
      match: { type: 'column', sheet: '*', column: 'B' },
      action: { type: 'redact', replacement: '***' },
    },
  ]
}

/** FNV-1a 32-bit non-crypto hash, fine for persona distribution. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}
