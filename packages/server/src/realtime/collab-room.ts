export interface Client {
  clientId: string
  userId: string
  send: (frame: unknown) => void
}

export interface RoomOpts {
  workbookId: string
}

export function createCollabRoom(opts: RoomOpts) {
  const clients = new Map<string, Client>()
  return {
    get workbookId() {
      return opts.workbookId
    },
    addClient(c: Client): void {
      clients.set(c.clientId, c)
    },
    removeClient(clientId: string): void {
      clients.delete(clientId)
    },
    listClients(): Client[] {
      return Array.from(clients.values())
    },
    getClient(clientId: string): Client | undefined {
      return clients.get(clientId)
    },
    broadcast(frame: unknown): void {
      for (const c of clients.values()) c.send(frame)
    },
    broadcastExcept(excludeClientId: string, frame: unknown): void {
      for (const c of clients.values()) {
        if (c.clientId !== excludeClientId) c.send(frame)
      }
    },
    size(): number {
      return clients.size
    },
  }
}

export type CollabRoom = ReturnType<typeof createCollabRoom>

export function createRoomRegistry() {
  const rooms = new Map<string, CollabRoom>()
  return {
    getOrCreate(workbookId: string): CollabRoom {
      let room = rooms.get(workbookId)
      if (!room) {
        room = createCollabRoom({ workbookId })
        rooms.set(workbookId, room)
      }
      return room
    },
    get(workbookId: string): CollabRoom | undefined {
      return rooms.get(workbookId)
    },
    drop(workbookId: string): void {
      rooms.delete(workbookId)
    },
    size(): number {
      return rooms.size
    },
  }
}

export type RoomRegistry = ReturnType<typeof createRoomRegistry>
