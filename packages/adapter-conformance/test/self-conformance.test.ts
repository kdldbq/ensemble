import { NoopEventAdapter } from '@ensemble-sheets/server'
import {
  runEventConformance, runPermissionConformance, runStorageConformance,
} from '../src/index'

runStorageConformance('in-memory', () => {
  const m = new Map<string, Uint8Array>()
  return {
    put: async (k, b) => { m.set(k, b) },
    get: async (k) => {
      const v = m.get(k); if (!v) throw new Error('not found'); return v
    },
    delete: async (k) => { m.delete(k) },
  }
})

runEventConformance('NoopEventAdapter', () => new NoopEventAdapter())

runPermissionConformance(
  'allow-all',
  () => ({
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }),
  {
    identity: { tenantId: 't', userId: 'u' },
    resource: { type: 'workbook', id: 'w', tenantId: 't' },
    expectedCapabilities: { canView: true, canEdit: true },
  }
)
