import type {
  Capability,
  IdentityContext,
  PermissionAdapter,
  ResourceRef,
} from '@ensemble-sheets/server'
import { describe, expect, it } from 'vitest'

export interface PermissionConformanceFixture {
  identity: IdentityContext
  resource: ResourceRef
  expectedCapabilities: Partial<Capability>
}

export function runPermissionConformance(
  name: string,
  adapterFactory: () => PermissionAdapter,
  fixture: PermissionConformanceFixture,
): void {
  describe(`PermissionAdapter conformance: ${name}`, () => {
    it('capability shape has 4 booleans', async () => {
      const adapter = adapterFactory()
      const caps = await adapter.getCapabilities(fixture.identity, fixture.resource)
      for (const k of ['canView', 'canEdit', 'canShare', 'canDelete'] as const) {
        expect(typeof caps[k]).toBe('boolean')
      }
    })
    it('matches expected capabilities', async () => {
      const adapter = adapterFactory()
      const caps = await adapter.getCapabilities(fixture.identity, fixture.resource)
      for (const [k, v] of Object.entries(fixture.expectedCapabilities)) {
        expect(caps[k as keyof Capability]).toBe(v)
      }
    })
    it('getMaskRules returns an array', async () => {
      const adapter = adapterFactory()
      const rules = await adapter.getMaskRules(fixture.identity, fixture.resource)
      expect(Array.isArray(rules)).toBe(true)
    })
  })
}
