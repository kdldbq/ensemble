import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/services/password'

describe('password', () => {
  it('hashes + verifies a correct password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple')
    expect(hash).toMatch(/^scrypt\$[a-f0-9]+\$[a-f0-9]+$/)
    expect(await verifyPassword('correct-horse-battery-staple', hash)).toBe(true)
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
