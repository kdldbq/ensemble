import type { EnsembleEvent, IdentityContext, ResourceRef, Capability, MaskRule } from './types'

export interface IdentityAdapter {
  resolveFromToken(token: string): Promise<IdentityContext>
}

export class NotImplementedIdentityAdapter implements IdentityAdapter {
  resolveFromToken(_token: string): Promise<IdentityContext> {
    return Promise.reject(new Error('IdentityAdapter not implemented'))
  }
}

export interface PermissionAdapter {
  getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability>
  getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]>
  /**
   * Filter the list of visible resources for the identity.
   * @returns object with optional `allowedIds`:
   *   - `undefined` → no filter applied (all results visible)
   *   - `[]`        → nothing visible (full restriction)
   *   - `[...ids]`  → only these ids are visible
   */
  filterListVisibility?(
    identity: IdentityContext,
    scope: 'folders' | 'workbooks'
  ): Promise<{ allowedIds?: string[] }>
}

export class NotImplementedPermissionAdapter implements PermissionAdapter {
  getCapabilities(_identity: IdentityContext, _resource: ResourceRef): Promise<Capability> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
  getMaskRules(_identity: IdentityContext, _workbook: ResourceRef): Promise<MaskRule[]> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
}

export interface EventAdapter {
  publish(event: EnsembleEvent): Promise<void>
}

export class NoopEventAdapter implements EventAdapter {
  async publish(_event: EnsembleEvent): Promise<void> {}
}
