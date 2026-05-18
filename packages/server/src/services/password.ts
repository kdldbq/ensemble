import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer | string,
  keylen: number,
  options?: { N?: number; r?: number; p?: number; maxmem?: number },
) => Promise<Buffer>

const SALT_LEN = 16
const KEY_LEN = 64
// Defaults match Node's built-in scrypt defaults; bumped together if needed
// for stronger hardening. Old hashes carry the cost they were minted with.
const DEFAULT_N = 16384
const DEFAULT_R = 8
const DEFAULT_P = 1
// Node enforces maxmem >= 128 * N * r * 2; bump headroom so a higher N
// doesn't trip the default 32MB cap.
const MAXMEM = 256 * 1024 * 1024

/**
 * Hash a plaintext password using node:crypto scrypt. Returns a self-describing
 * string `scrypt$<N>$<r>$<p>$<salt_hex>$<derived_hex>` so the cost parameters
 * are embedded — future bumps of the cost factor don't invalidate older hashes,
 * verify() re-runs scrypt with the original parameters.
 *
 * Legacy 3-segment hashes (`scrypt$<salt>$<derived>`, no cost params) are also
 * accepted by verifyPassword for backwards compatibility with hashes minted
 * before this format change.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length === 0) throw new Error('password cannot be empty')
  if (plain.length > 256) throw new Error('password too long (max 256 chars)')
  const salt = randomBytes(SALT_LEN)
  const derived = await scryptAsync(plain, salt, KEY_LEN, {
    N: DEFAULT_N,
    r: DEFAULT_R,
    p: DEFAULT_P,
    maxmem: MAXMEM,
  })
  return `scrypt$${DEFAULT_N}$${DEFAULT_R}$${DEFAULT_P}$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Constant-time verify of a plaintext password against a stored hash.
 * Returns false (rather than throwing) on malformed stored hash.
 * Accepts both the new 6-segment format and the legacy 3-segment format
 * (which used Node's then-defaults: N=16384 r=8 p=1).
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts[0] !== 'scrypt') return false

  let N: number
  let r: number
  let p: number
  let saltHex: string | undefined
  let expectedHex: string | undefined
  if (parts.length === 6) {
    N = Number(parts[1])
    r = Number(parts[2])
    p = Number(parts[3])
    saltHex = parts[4]
    expectedHex = parts[5]
    if (!Number.isInteger(N) || N <= 0 || !Number.isInteger(r) || r <= 0 || !Number.isInteger(p) || p <= 0) {
      return false
    }
  } else if (parts.length === 3) {
    // Legacy hash minted before cost params were embedded; assume defaults.
    N = DEFAULT_N
    r = DEFAULT_R
    p = DEFAULT_P
    saltHex = parts[1]
    expectedHex = parts[2]
  } else {
    return false
  }
  if (!saltHex || !expectedHex) return false

  // Buffer.from(s, 'hex') silently truncates on malformed hex rather than
  // throwing, so the length check below is what actually rejects bad input.
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const derived = await scryptAsync(plain, salt, expected.length, { N, r, p, maxmem: MAXMEM })
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}
