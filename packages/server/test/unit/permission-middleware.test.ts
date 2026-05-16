import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { PermissionAdapter } from '../../src/adapters/identity'
import { requireCapability } from '../../src/http/permission'

function appWith(
  permission: PermissionAdapter,
  capability: 'canView' | 'canEdit' | 'canShare' | 'canDelete',
) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('deps' as never, { permission } as never)
    c.set('identity' as never, { tenantId: 't', userId: 'u' } as never)
    await next()
  })
  app.get(
    '/wb/:id',
    requireCapability(capability, (c) => ({
      type: 'workbook',
      id: c.req.param('id'),
      tenantId: c.get('identity' as never).tenantId,
    })) as never,
    (c) => c.json({ ok: true }),
  )
  return app
}

describe('requireCapability', () => {
  it('passes when capability is true', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: true,
        canEdit: false,
        canShare: false,
        canDelete: false,
      }),
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canView').request('/wb/abc')
    expect(res.status).toBe(200)
  })

  it('403 when capability is false', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({
        canView: false,
        canEdit: false,
        canShare: false,
        canDelete: false,
      }),
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canView').request('/wb/abc')
    expect(res.status).toBe(403)
  })

  it('500 when adapter throws', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => {
        throw new Error('exploded')
      },
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canEdit').request('/wb/x')
    expect(res.status).toBe(500)
  })
})
