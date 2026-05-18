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
 * Constant-time verify that `hmacLinkToken(secret, token) === storedHex`.
 * Returns false (no throw) when `storedHex` is malformed or empty.
 */
export function verifyLinkTokenHmac(secret: string, token: string, storedHex: string): boolean {
  if (!secret) return false
  if (!token) return false
  if (storedHex.length !== HMAC_HEX_LEN) return false
  const computed = hmacLinkToken(secret, token)
  const a = Buffer.from(computed, 'hex')
  const b = Buffer.from(storedHex, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
