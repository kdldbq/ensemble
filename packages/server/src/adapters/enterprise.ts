/**
 * Enterprise adapter contracts — opt-in host integrations for approval flows,
 * license/seat management, custom templates, and brand customization.
 * Covers L7-L10 backlog.
 */

// ─── L7 Approval flow ────────────────────────────────────────────────────

export interface ApprovalRequest {
  action: 'create_workbook' | 'share_grant' | 'workbook_delete' | string
  tenantId: string
  requesterId: string
  context: Record<string, unknown>
}

export interface ApprovalDecision {
  approved: boolean
  reason?: string
  pendingId?: string
}

export interface ApprovalAdapter {
  requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>
}

export class AlwaysApproveAdapter implements ApprovalAdapter {
  async requestApproval(): Promise<ApprovalDecision> {
    return { approved: true }
  }
}

// ─── L8 License / seat management ────────────────────────────────────────

export interface SeatUsage {
  total: number
  used: number
  free?: number
}

export interface LicenseAdapter {
  getSeatUsage(tenantId: string): Promise<SeatUsage>
  hasSeatFor(tenantId: string, userId: string): Promise<boolean>
}

export class UnlimitedLicenseAdapter implements LicenseAdapter {
  async getSeatUsage(): Promise<SeatUsage> {
    return { total: Number.POSITIVE_INFINITY, used: 0 }
  }
  async hasSeatFor(): Promise<boolean> {
    return true
  }
}

// ─── L9 Template catalog ─────────────────────────────────────────────────

export interface WorkbookTemplate {
  id: string
  name: string
  description?: string
  category?: string
  data: Record<string, unknown>
  restrictedToRole?: string
}

export interface TemplateAdapter {
  listTemplates(tenantId: string): Promise<WorkbookTemplate[]>
  getTemplate(tenantId: string, templateId: string): Promise<WorkbookTemplate | null>
}

export class EmptyTemplateAdapter implements TemplateAdapter {
  async listTemplates(): Promise<WorkbookTemplate[]> {
    return []
  }
  async getTemplate(): Promise<WorkbookTemplate | null> {
    return null
  }
}

// ─── L10 Brand customization ─────────────────────────────────────────────

export interface BrandingConfig {
  productName?: string
  logoUrl?: string
  primaryColor?: string
  shareLinkHost?: string
  shareFooter?: string
}

export interface BrandingAdapter {
  getBranding(tenantId: string): Promise<BrandingConfig>
}

export class DefaultBrandingAdapter implements BrandingAdapter {
  async getBranding(): Promise<BrandingConfig> {
    return { productName: 'ensemble' }
  }
}
