export * from './adapters/types'
export type {
  IdentityAdapter,
  PermissionAdapter,
  EventAdapter,
  ErrorAdapter,
  ErrorContext,
  HandoffResult,
} from './adapters/identity'
export {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
  NoopErrorAdapter,
} from './adapters/identity'
export type { StorageAdapter } from './adapters/storage'
export type { LLMAdapter, LLMMessage, LLMGenerateOpts, LLMResult } from './adapters/llm'
export { NoopLLMAdapter } from './adapters/llm'
export type { DlpRule, DlpFinding, RiskAdapter } from './services/dlp-rules'
export {
  DEFAULT_DLP_RULES,
  NoopRiskAdapter,
  scanPayload,
  scanText,
} from './services/dlp-rules'
export type {
  ApprovalAdapter,
  ApprovalRequest,
  ApprovalDecision,
  LicenseAdapter,
  SeatUsage,
  TemplateAdapter,
  WorkbookTemplate,
  BrandingAdapter,
  BrandingConfig,
} from './adapters/enterprise'
export {
  AlwaysApproveAdapter,
  UnlimitedLicenseAdapter,
  EmptyTemplateAdapter,
  DefaultBrandingAdapter,
} from './adapters/enterprise'
export { createServer, type CreateServerOpts } from './server'
export { buildApp, type AppDeps, type AppEnv } from './http/app'
export { createDb, type Database } from './db/client'
export * as schema from './db/schema'
// Re-export the drizzle helpers we know consumers need so they pull from this package's
// single drizzle instance (avoids pnpm dedupe issues when consumers also depend on
// drizzle-orm directly via a different peer context).
export { and, eq, sql } from 'drizzle-orm'
