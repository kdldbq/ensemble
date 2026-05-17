/**
 * AI Agent governance (G3.1).
 *
 * Lets enterprises gate LLM usage: daily token quotas, model allowlists,
 * department-level budgets.
 */

export interface AgentUsageQuery {
  tenantId: string
  userId: string
  estimatedTokens?: number
  requestedModel?: string
  feature: 'formula' | 'bi' | 'chart-suggest' | 'detect-columns' | 'custom'
}

export interface AgentUsageDecision {
  allowed: boolean
  reason?: 'quota_exceeded' | 'model_blocked' | 'feature_blocked' | 'tenant_paused' | string
  message?: string
  remainingTokens?: number
}

export interface AgentUsageRecord {
  tenantId: string
  userId: string
  feature: string
  model?: string
  promptTokens: number
  completionTokens: number
  occurredAt: string
}

export interface AgentPolicyAdapter {
  checkUsage(query: AgentUsageQuery): Promise<AgentUsageDecision>
  recordUsage(record: AgentUsageRecord): Promise<void>
}

/** Default: allow everything, persist nothing. */
export class UnrestrictedAgentPolicyAdapter implements AgentPolicyAdapter {
  async checkUsage(): Promise<AgentUsageDecision> {
    return { allowed: true }
  }
  async recordUsage(): Promise<void> {
    /* swallow */
  }
}

/** In-memory quota adapter for single-instance deploys + tests. */
export class InMemoryAgentPolicyAdapter implements AgentPolicyAdapter {
  private usage = new Map<string, { tokens: number; windowStart: number }>()

  constructor(
    private readonly opts: {
      dailyTokenQuotaPerTenant: number
      allowedModels?: string[]
      blockedFeatures?: Array<'formula' | 'bi' | 'chart-suggest' | 'detect-columns'>
    },
  ) {}

  private rollWindow(tenantId: string): { tokens: number; windowStart: number } {
    const now = Date.now()
    const dayMs = 24 * 60 * 60 * 1000
    let entry = this.usage.get(tenantId)
    if (!entry || now - entry.windowStart > dayMs) {
      entry = { tokens: 0, windowStart: now }
      this.usage.set(tenantId, entry)
    }
    return entry
  }

  async checkUsage(query: AgentUsageQuery): Promise<AgentUsageDecision> {
    if (this.opts.blockedFeatures?.includes(query.feature as 'formula')) {
      return { allowed: false, reason: 'feature_blocked' }
    }
    if (
      query.requestedModel &&
      this.opts.allowedModels &&
      !this.opts.allowedModels.includes(query.requestedModel)
    ) {
      return {
        allowed: false,
        reason: 'model_blocked',
        message: `${query.requestedModel} is not in the allowlist`,
      }
    }
    const entry = this.rollWindow(query.tenantId)
    const remaining = this.opts.dailyTokenQuotaPerTenant - entry.tokens
    if (remaining <= 0) {
      return { allowed: false, reason: 'quota_exceeded', remainingTokens: 0 }
    }
    return { allowed: true, remainingTokens: remaining }
  }

  async recordUsage(record: AgentUsageRecord): Promise<void> {
    const entry = this.rollWindow(record.tenantId)
    entry.tokens += record.promptTokens + record.completionTokens
  }
}
