import type { EnsembleEvent, EventAdapter } from '@ensemble-sheets/server'
import { describe, expect, it } from 'vitest'

export function runEventConformance(name: string, adapterFactory: () => EventAdapter): void {
  describe(`EventAdapter conformance: ${name}`, () => {
    it('publish resolves for all 5 event types', async () => {
      const a = adapterFactory()
      const events: EnsembleEvent[] = [
        { type: 'workbook.created', workbookId: 'w', userId: 'u', at: new Date().toISOString() },
        { type: 'workbook.opened', workbookId: 'w', userId: 'u', at: new Date().toISOString() },
        {
          type: 'workbook.edited',
          workbookId: 'w',
          userId: 'u',
          batchedOpsCount: 0,
          at: new Date().toISOString(),
        },
        { type: 'folder.created', folderId: 'f', userId: 'u', at: new Date().toISOString() },
        { type: 'share.granted', grantId: 'g', grantedBy: 'u', at: new Date().toISOString() },
      ]
      for (const e of events) await expect(a.publish(e)).resolves.toBeUndefined()
    })
  })
}
