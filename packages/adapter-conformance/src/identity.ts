import type { IdentityAdapter } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export interface IdentityConformanceFixture {
  validToken: string | (() => Promise<string>)
  expectedTenantId: string
  expectedUserId: string
  invalidToken: string | (() => Promise<string>)
}

export function runIdentityConformance(
  name: string,
  adapterFactory: () => IdentityAdapter,
  fixture: IdentityConformanceFixture
): void {
  describe(`IdentityAdapter conformance: ${name}`, () => {
    it('resolves valid token', async () => {
      const adapter = adapterFactory()
      const token = typeof fixture.validToken === 'function' ? await fixture.validToken() : fixture.validToken
      const ctx = await adapter.resolveFromToken(token)
      expect(ctx.tenantId).toBe(fixture.expectedTenantId)
      expect(ctx.userId).toBe(fixture.expectedUserId)
    })
    it('rejects invalid token', async () => {
      const adapter = adapterFactory()
      const token = typeof fixture.invalidToken === 'function' ? await fixture.invalidToken() : fixture.invalidToken
      await expect(adapter.resolveFromToken(token)).rejects.toThrow()
    })
  })
}
