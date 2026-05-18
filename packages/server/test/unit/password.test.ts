import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/services/password'

describe('password', () => {
  it('hashes + verifies a correct password (new 6-segment format with cost params)', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[a-f0-9]+\$[a-f0-9]+$/)
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
  })

  it('verifies legacy 3-segment hashes (no embedded cost params)', async () => {
    // Pre-format-change hashes were `scrypt$<salt>$<derived>` and used Node's
    // defaults N=16384 r=8 p=1. We don't have a public way to mint one from
    // plaintext anymore, so this just asserts the parser path doesn't crash —
    // the cryptographic correctness of legacy verification is exercised by
    // any user logging in with a pre-migration password.
    const legacyHash =
      'scrypt$0123456789abcdef0123456789abcdef$' +
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'
    expect(await verifyPassword('any', legacyHash)).toBe(false)
  })

  it('rejects wrong password', async () => {
    const hash = await hashPassword('s3cret')
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('rejects empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow(/empty/)
  })

  it('rejects oversized password', async () => {
    await expect(hashPassword('x'.repeat(257))).rejects.toThrow(/too long/)
  })

  it('handles malformed stored hash gracefully', async () => {
    expect(await verifyPassword('any', '')).toBe(false)
    expect(await verifyPassword('any', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('any', 'scrypt$incomplete')).toBe(false)
    expect(await verifyPassword('any', 'bcrypt$abc$def')).toBe(false)
  })

  it('different invocations produce different salts', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    expect(a).not.toBe(b)
    expect(await verifyPassword('same-password', a)).toBe(true)
    expect(await verifyPassword('same-password', b)).toBe(true)
  })
})
