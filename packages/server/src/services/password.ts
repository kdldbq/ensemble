import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: Buffer | string,
  keylen: number,
) => Promise<Buffer>

const SALT_LEN = 16
const KEY_LEN = 64

/**
 * Hash a plaintext password using node:crypto scrypt. Returns a self-describing
 * string `scrypt$<salt_hex>$<derived_hex>` — verify() parses it back. Zero
 * runtime deps; scrypt is memory-hard against GPU attacks.
 */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length === 0) throw new Error('password cannot be empty')
  if (plain.length > 256) throw new Error('password too long (max 256 chars)')
  const salt = randomBytes(SALT_LEN)
  const derived = await scryptAsync(plain, salt, KEY_LEN)
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`
}

/**
 * Constant-time verify of a plaintext password against a stored hash.
 * Returns false (rather than throwing) on malformed stored hash.
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored || typeof stored !== 'string') return false
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const saltHex = parts[1]
  const expectedHex = parts[2]
  if (!saltHex || !expectedHex) return false
  // Buffer.from(s, 'hex') silently truncates on malformed hex rather than
  // throwing, so the length check below is what actually rejects bad input.
  const salt = Buffer.from(saltHex, 'hex')
  const expected = Buffer.from(expectedHex, 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const derived = await scryptAsync(plain, salt, expected.length)
  if (derived.length !== expected.length) return false
  return timingSafeEqual(derived, expected)
}
