// Re-export the drizzle helpers we know consumers need so they pull from this package's
// single drizzle instance (avoids pnpm dedupe issues when consumers also depend on
// drizzle-orm directly via a different peer context).
export { and, eq, sql } from 'drizzle-orm'
export type {
  AgentPolicyAdapter,
  AgentUsageDecision,
  AgentUsageQuery,
  AgentUsageRecord,
} from './adapters/agent-policy'
export {
  InMemoryAgentPolicyAdapter,
  UnrestrictedAgentPolicyAdapter,
} from './adapters/agent-policy'
export type {
  ApprovalAdapter,
  ApprovalDecision,
  ApprovalRequest,
  BrandingAdapter,
  BrandingConfig,
  LicenseAdapter,
  SeatUsage,
  TemplateAdapter,
  WorkbookTemplate,
} from './adapters/enterprise'
export {
  AlwaysApproveAdapter,
  DefaultBrandingAdapter,
  EmptyTemplateAdapter,
  UnlimitedLicenseAdapter,
} from './adapters/enterprise'
export type {
  ErrorAdapter,
  ErrorContext,
  EventAdapter,
  HandoffResult,
  IdentityAdapter,
  PermissionAdapter,
} from './adapters/identity'
export {
  NoopErrorAdapter,
  NoopEventAdapter,
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
} from './adapters/identity'
export type { LLMAdapter, LLMGenerateOpts, LLMMessage, LLMResult } from './adapters/llm'
export { NoopLLMAdapter } from './adapters/llm'
export type {
  OAuthAdapter,
  OAuthIdentity,
  OAuthProviderConfig,
  OAuthState,
} from './adapters/oauth'
export { NotImplementedOAuthAdapter } from './adapters/oauth'
export type { OcrAdapter, OcrCell, OcrInput, OcrTable } from './adapters/ocr'
export { NotImplementedOcrAdapter } from './adapters/ocr'
export type { StorageAdapter } from './adapters/storage'
export * from './adapters/types'
export { createDb, type Database } from './db/client'
export * as schema from './db/schema'
export { type AppDeps, type AppEnv, buildApp } from './http/app'
export { type CreateServerOpts, createServer } from './server'
export type { DlpFinding, DlpRule, RiskAdapter } from './services/dlp-rules'
export {
  DEFAULT_DLP_RULES,
  NoopRiskAdapter,
  scanPayload,
  scanText,
} from './services/dlp-rules'
export type { OtlpHttpTracerOpts, Span, SpanAttributes, Tracer } from './tracing'
export { createOtlpHttpTracer, getTracer, setTracer, traced } from './tracing'
