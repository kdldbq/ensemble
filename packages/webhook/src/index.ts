import { createHmac } from 'node:crypto'
import type {
  IdentityAdapter,
  PermissionAdapter,
  EventAdapter,
  IdentityContext,
  ResourceRef,
  Capability,
  MaskRule,
  EnsembleEvent,
} from '@ensemble/server'

export interface WebhookOpts {
  url: string
  secret: string
  timeoutMs?: number
}

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

async function post<T>(opts: WebhookOpts, payload: unknown, expect2xx: boolean): Promise<T | null> {
  const body = JSON.stringify(payload)
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ensemble-signature': sign(opts.secret, body),
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

export class WebhookIdentityAdapter implements IdentityAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async resolveFromToken(token: string): Promise<IdentityContext> {
    const r = await post<IdentityContext>(this.opts, { token }, true)
    if (!r) throw new Error('identity webhook returned no body')
    return r
  }
}

export class WebhookPermissionAdapter implements PermissionAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability> {
    const r = await post<Capability>(this.opts, { op: 'capabilities', identity, resource }, true)
    if (!r) throw new Error('permission webhook returned no body')
    return r
  }
  async getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]> {
    const r = await post<MaskRule[]>(this.opts, { op: 'mask_rules', identity, resource: workbook }, true)
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
