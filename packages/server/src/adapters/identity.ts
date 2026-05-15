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
  filterListVisibility?(
    identity: IdentityContext,
    scope: 'folders' | 'workbooks'
  ): Promise<{ allowedIds?: string[] }>
}

export class NotImplementedPermissionAdapter implements PermissionAdapter {
  getCapabilities(): Promise<Capability> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
  getMaskRules(): Promise<MaskRule[]> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
}

export interface EventAdapter {
  publish(event: EnsembleEvent): Promise<void>
}

export class NoopEventAdapter implements EventAdapter {
  async publish(_event: EnsembleEvent): Promise<void> {}
}
