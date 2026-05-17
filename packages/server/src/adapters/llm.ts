/**
 * LLM adapter — host-pluggable surface for AI features (formula gen, smart split,
 * BI Q&A). Reference implementations live in /examples; the adapter pattern means
 * ensemble itself doesn't bind to any single provider. Like other adapters, the
 * host implements this interface and passes it via createServer({ llm }).
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LLMGenerateOpts {
  messages: LLMMessage[]
  maxTokens?: number
  temperature?: number
  tools?: unknown[]
  tenantId: string
  userId: string
}

export interface LLMResult {
  text: string
  tokens?: { prompt: number; completion: number }
  model?: string
}

export interface LLMAdapter {
  /**
   * One-shot completion. Adapter implementations may add internal retries +
   * timeouts; the contract is "throw if non-recoverable".
   */
  generate(opts: LLMGenerateOpts): Promise<LLMResult>
  /**
   * Optional streaming variant (G1.3). Yields incremental text chunks as the
   * provider generates them. When undefined, /api/v1/ai/*/stream endpoints
   * fall back to generate() + single-chunk emission.
   */
  streamGenerate?(opts: LLMGenerateOpts): AsyncIterable<string>
}

/**
 * Default adapter when the host doesn't wire one up — every call rejects with
 * a clear error so feature code can show "LLM not configured" to the user
 * instead of silently returning empty results.
 */
export class NoopLLMAdapter implements LLMAdapter {
  async generate(_opts: LLMGenerateOpts): Promise<LLMResult> {
    throw new Error('LLM not configured — host must provide an LLMAdapter via createServer.llm')
  }
}
