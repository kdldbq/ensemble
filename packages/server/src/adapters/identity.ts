import type { Capability, EnsembleEvent, IdentityContext, MaskRule, ResourceRef } from './types'

export interface IdentityAdapter {
  resolveFromToken(token: string): Promise<IdentityContext>
  /**
   * Optional employee-leaver handoff. When a user departs, the host can
   * implement this to reassign their owned resources to another user
   * (manager, successor). Called by an admin tool / scheduled job — ensemble
   * does NOT call this on every login. If undefined, hosts handle handoff
   * out-of-band (manual SQL, etc.).
   */
  handoff?(fromUserId: string, toUserId: string, tenantId: string): Promise<HandoffResult>
}

export interface HandoffResult {
  workbooksTransferred: number
  foldersTransferred: number
  errors: string[]
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
    scope: 'folders' | 'workbooks',
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

/**
 * Optional error sink (I8). Hosts wire Sentry, Datadog, OpsGenie, etc.
 * When undefined, errors only land in pino logs. Hosts implementing this
 * adapter receive *structured* errors with module + context for tagging.
 */
export interface ErrorAdapter {
  capture(error: Error, context: ErrorContext): Promise<void> | void
}

export interface ErrorContext {
  /** Originating module — 'http' | 'ws' | 'auth' | 'storage' | 'mask' | ... */
  module: string
  tenantId?: string
  userId?: string
  workbookId?: string
  /** Free-form extras for tagging (request path, frame type, etc). */
  extra?: Record<string, unknown>
}

export class NoopErrorAdapter implements ErrorAdapter {
  capture(_error: Error, _context: ErrorContext): void {
    /* swallow — pino already logged it */
  }
}
