import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Cryptographic primitives for public_link grant tokens.
 *
 * Tokens are generated server-side from 32 bytes of CSPRNG entropy and
 * returned to the caller exactly once (in the grant create response).
 * Only the HMAC-SHA256 of the token is persisted in `share_grants.link_token_hmac`,
 * keyed by `AppDeps.linkHmacSecret` (env: ENSEMBLE_LINK_HMAC_SECRET).
 *
 * Background: pre-v0.3 grants stored the cleartext token in `granteeId`,
 * which leaked tokens on any DB dump. The new path keeps cleartext out of
 * the database entirely. Legacy rows with `linkTokenHmac=NULL` still verify
 * via cleartext compare on `granteeId` (dual-path rollout — see grant-service).
 */

const HMAC_HEX_LEN = 64
const HMAC_HEX_RE = /^[0-9a-f]{64}$/

/**
 * Generate a CSPRNG-backed token (32 bytes, base64url-encoded, ~43 chars).
 */
export function generateLinkToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * HMAC-SHA256 a token under the server secret, returned as lowercase hex.
 * Throws on empty secret to surface bootstrap misconfiguration early.
 */
export function hmacLinkToken(secret: string, token: string): string {
  if (!secret) throw new Error('hmacLinkToken: secret is required')
  return createHmac('sha256', secret).update(token).digest('hex')
}

/**
 * Constant-time equality on two HMAC-hex strings. Returns false if either
 * is not a well-formed 64-char lowercase-hex value. Used by callers that
 * have already computed the HMAC of the presented token once and want to
 * compare it against many stored values without re-hashing.
 */
export function constantTimeHexEq(a: string, b: string): boolean {
  if (
    a.length !== HMAC_HEX_LEN ||
    b.length !== HMAC_HEX_LEN ||
    !HMAC_HEX_RE.test(a) ||
    !HMAC_HEX_RE.test(b)
  ) {
    return false
  }
  // Validate format BEFORE Buffer.from — node's 'hex' decoder silently drops
  // non-hex chars, so a 64-char-but-mostly-garbage string would yield a short
  // buffer and a length-mismatch side-channel.
  const ab = Buffer.from(a, 'hex')
  const bb = Buffer.from(b, 'hex')
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/**
 * Constant-time verify that `hmacLinkToken(secret, token) === storedHex`.
 * Returns false (no throw) when `storedHex` is malformed or empty.
 */
export function verifyLinkTokenHmac(secret: string, token: string, storedHex: string): boolean {
  if (!secret || !token) return false
  return constantTimeHexEq(hmacLinkToken(secret, token), storedHex)
}
