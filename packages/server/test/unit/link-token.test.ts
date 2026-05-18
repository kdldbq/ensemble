import { describe, expect, it } from 'vitest'
import {
  generateLinkToken,
  hmacLinkToken,
  verifyLinkTokenHmac,
} from '../../src/services/link-token'

const SECRET_A = 'a'.repeat(64)
const SECRET_B = 'b'.repeat(64)

describe('link-token helpers', () => {
  describe('generateLinkToken', () => {
    it('returns a high-entropy string', () => {
      const t = generateLinkToken()
      // base64url of >=32 bytes → at least 43 chars, only url-safe alphabet
      expect(t.length).toBeGreaterThanOrEqual(43)
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('produces a unique token on each call', () => {
      const a = generateLinkToken()
      const b = generateLinkToken()
      expect(a).not.toBe(b)
    })
  })

  describe('hmacLinkToken', () => {
    it('is deterministic for (secret, token)', () => {
      const t = 'token-xyz'
      expect(hmacLinkToken(SECRET_A, t)).toBe(hmacLinkToken(SECRET_A, t))
    })

    it('differs across secrets', () => {
      const t = 'token-xyz'
      expect(hmacLinkToken(SECRET_A, t)).not.toBe(hmacLinkToken(SECRET_B, t))
    })

    it('differs across tokens', () => {
      expect(hmacLinkToken(SECRET_A, 'one')).not.toBe(hmacLinkToken(SECRET_A, 'two'))
    })

    it('returns lowercase hex (64 chars for SHA-256)', () => {
      const h = hmacLinkToken(SECRET_A, 'token-xyz')
      expect(h).toMatch(/^[0-9a-f]{64}$/)
    })

    it('rejects empty secret', () => {
      expect(() => hmacLinkToken('', 'token')).toThrow()
    })
  })

  describe('verifyLinkTokenHmac', () => {
    it('returns true when presented token matches stored hmac', () => {
      const token = generateLinkToken()
      const stored = hmacLinkToken(SECRET_A, token)
      expect(verifyLinkTokenHmac(SECRET_A, token, stored)).toBe(true)
    })

    it('returns false for wrong token', () => {
      const stored = hmacLinkToken(SECRET_A, 'right-token')
      expect(verifyLinkTokenHmac(SECRET_A, 'wrong-token', stored)).toBe(false)
    })

    it('returns false for wrong secret', () => {
      const token = 'token'
      const stored = hmacLinkToken(SECRET_A, token)
      expect(verifyLinkTokenHmac(SECRET_B, token, stored)).toBe(false)
    })

    it('returns false when stored hmac has unexpected length (no throw)', () => {
      expect(verifyLinkTokenHmac(SECRET_A, 'token', 'short')).toBe(false)
    })

    it('returns false for empty token', () => {
      const stored = hmacLinkToken(SECRET_A, 'real-token')
      expect(verifyLinkTokenHmac(SECRET_A, '', stored)).toBe(false)
    })
  })
})
