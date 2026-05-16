import { type IncomingMessage, type ServerResponse, createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebhookEventAdapter, WebhookIdentityAdapter, WebhookPermissionAdapter } from '../src/index'

let url: string
let close: () => Promise<void>
const requests: { path: string; body: unknown; signature: string | null }[] = []

beforeAll(async () => {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    requests.push({
      path: req.url ?? '',
      body: raw ? JSON.parse(raw) : null,
      signature: (req.headers['x-ensemble-signature'] as string) ?? null,
    })
    if (req.url === '/identity') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ tenantId: 't1', userId: 'u1' }))
      return
    }
    if (req.url === '/permission') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ canView: true, canEdit: false, canShare: false, canDelete: false }))
      return
    }
    if (req.url === '/event') {
      res.statusCode = 204
      res.end()
      return
    }
    res.statusCode = 404
    res.end()
  })
  await new Promise<void>((r) => server.listen(0, r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no addr')
  url = `http://127.0.0.1:${addr.port}`
  close = () => new Promise((r) => server.close(() => r()))
})
afterAll(() => close())

describe('Webhook adapters', () => {
  it('Identity sends signed POST to /identity with the token', async () => {
    const a = new WebhookIdentityAdapter({ url: `${url}/identity`, secret: 's' })
    const ctx = await a.resolveFromToken('jwt-here')
    expect(ctx).toEqual({ tenantId: 't1', userId: 'u1' })
    const r = requests.find((x) => x.path === '/identity')!
    expect(r.body).toEqual({ token: 'jwt-here' })
    expect(r.signature).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('Permission sends getCapabilities request', async () => {
    const a = new WebhookPermissionAdapter({ url: `${url}/permission`, secret: 's' })
    const cap = await a.getCapabilities(
      { tenantId: 't', userId: 'u' },
      { type: 'workbook', id: 'w', tenantId: 't' },
    )
    expect(cap.canView).toBe(true)
  })

  it('Event swallows host errors (fire-and-forget)', async () => {
    const a = new WebhookEventAdapter({ url: `${url}/missing`, secret: 's' })
    await expect(
      a.publish({
        type: 'workbook.opened',
        workbookId: 'w',
        userId: 'u',
        at: new Date().toISOString(),
      }),
    ).resolves.toBeUndefined()
  })
})
