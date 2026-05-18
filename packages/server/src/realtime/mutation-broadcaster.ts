import type { MaskRule } from '../adapters/types'
import { applyMaskRules, type WorkbookData } from '../services/mask-service'
import type { MutationService } from '../services/mutation-service'
import type { CollabRoom } from './collab-room'

export interface MutationBroadcasterDeps {
  mutations: MutationService
  getMaskRulesFor: (userId: string, workbookId: string) => Promise<MaskRule[]>
}

function payloadLooksLikeWorkbookData(x: unknown): boolean {
  return (
    typeof x === 'object' &&
    x !== null &&
    'sheetOrder' in (x as Record<string, unknown>) &&
    'sheets' in (x as Record<string, unknown>)
  )
}

export function createMutationBroadcaster(deps: MutationBroadcasterDeps) {
  return {
    async submit(input: {
      room: CollabRoom
      senderClientId: string
      senderUserId: string
      workbookId: string
      clientSeq: number
      region: string
      payload: unknown
    }): Promise<{ seqNum: number }> {
      const { seqNum } = await deps.mutations.append({
        workbookId: input.workbookId,
        userId: input.senderUserId,
        payload: input.payload,
      })

      const sender = input.room.getClient(input.senderClientId)
      sender?.send({ type: 'mutation_accepted', clientSeq: input.clientSeq, seqNum })

      for (const client of input.room.listClients()) {
        if (client.clientId === input.senderClientId) continue
        const rules = await deps.getMaskRulesFor(client.userId, input.workbookId)
        let outPayload: unknown = input.payload
        if (rules.length > 0 && payloadLooksLikeWorkbookData(input.payload)) {
          outPayload = applyMaskRules(input.payload as WorkbookData, rules)
        }
        client.send({
          type: 'apply_mutation',
          seqNum,
          userId: input.senderUserId,
          payload: outPayload,
        })
      }

      return { seqNum }
    },
  }
}

export type MutationBroadcaster = ReturnType<typeof createMutationBroadcaster>
