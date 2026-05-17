import { createHmac } from 'node:crypto'
import type {
  Capability,
  EnsembleEvent,
  EventAdapter,
  IdentityAdapter,
  IdentityContext,
  MaskRule,
  PermissionAdapter,
  ResourceRef,
} from '@ensemble-sheets/server'

export interface WebhookOpts {
  url: string
  secret: string
  timeoutMs?: number
  /**
   * Optional retry policy applied to non-2xx responses AND transport errors.
   * Defaults to no retry (preserves existing behaviour).
   * Exponential backoff: baseDelayMs * 2^attempt (capped at 30s).
   */
  retry?: {
    attempts: number
    baseDelayMs?: number
    /**
     * Called when ALL attempts have been exhausted. Useful for dead-letter
     * queues — host can persist the failed event for later replay.
     */
    onDeadLetter?: (err: Error, attempts: number, payload: unknown) => void | Promise<void>
  }
}

function sign(secret: string, timestamp: string, body: string): string {
  // v2 signature: HMAC(secret, `${timestamp}.${body}`) — protects against replay.
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`
}

function legacySign(secret: string, body: string): string {
  // v1 signature: HMAC(secret, body) — kept for back-compat.
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function postOnce<T>(
  opts: WebhookOpts,
  payload: unknown,
  expect2xx: boolean,
): Promise<T | null> {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ensemble-signature': legacySign(opts.secret, body),
        'x-ensemble-signature-v2': sign(opts.secret, timestamp, body),
        'x-ensemble-timestamp': timestamp,
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      if (expect2xx) throw new Error(`webhook ${opts.url} returned ${res.status}`)
      return null
    }
    if (res.status === 204) return null
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

async function post<T>(opts: WebhookOpts, payload: unknown, expect2xx: boolean): Promise<T | null> {
  const policy = opts.retry
  if (!policy || policy.attempts <= 1) {
    return postOnce<T>(opts, payload, expect2xx)
  }
  let lastErr: Error | null = null
  const base = policy.baseDelayMs ?? 500
  for (let attempt = 0; attempt < policy.attempts; attempt++) {
    try {
      return await postOnce<T>(opts, payload, expect2xx)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (attempt === policy.attempts - 1) break
      const delay = Math.min(base * 2 ** attempt, 30_000)
      await sleep(delay)
    }
  }
  if (lastErr && policy.onDeadLetter) {
    try {
      await policy.onDeadLetter(lastErr, policy.attempts, payload)
    } catch {
      /* swallow — dead-letter callback is best-effort */
    }
  }
  if (expect2xx && lastErr) throw lastErr
  return null
}

export class WebhookIdentityAdapter implements IdentityAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async resolveFromToken(token: string): Promise<IdentityContext> {
    const r = await postOnce<IdentityContext>(this.opts, { token }, true)
    if (!r) throw new Error('identity webhook returned no body')
    return r
  }
}

export class WebhookPermissionAdapter implements PermissionAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability> {
    const r = await postOnce<Capability>(this.opts, { op: 'capabilities', identity, resource }, true)
    if (!r) throw new Error('permission webhook returned no body')
    return r
  }
  async getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]> {
    const r = await postOnce<MaskRule[]>(
      this.opts,
      { op: 'mask_rules', identity, resource: workbook },
      true,
    )
    return r ?? []
  }
}

export class WebhookEventAdapter implements EventAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async publish(event: EnsembleEvent): Promise<void> {
    try {
      await post(this.opts, event, false)
    } catch {
      /* fire-and-forget */
    }
  }
}
