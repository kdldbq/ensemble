/**
 * J3 — IndexedDB-backed offline mutation queue.
 *
 * When the WS bridge is disconnected, ensemble's mount layer enqueues
 * submit_mutation payloads here. On reconnect, the queue is drained in order
 * and each entry is replayed via the live ws-client. The store is per-origin
 * so multiple workbooks share one db; entries are partitioned by workbookId.
 */

export interface QueuedMutation {
  id?: number
  workbookId: string
  clientSeq: number
  region: string
  payload: unknown
  ts: number
}

export interface OfflineCacheOpts {
  dbName?: string
  storeName?: string
  idbFactory?: IDBFactory
}

const DEFAULT = {
  dbName: 'ensemble-offline',
  storeName: 'pending_mutations',
}

export interface OfflineCache {
  enqueue(m: Omit<QueuedMutation, 'id'>): Promise<number>
  drain(workbookId: string): Promise<QueuedMutation[]>
  remove(ids: number[]): Promise<void>
  size(): Promise<number>
  clear(): Promise<void>
}

export function createOfflineCache(opts: OfflineCacheOpts = {}): OfflineCache {
  const cfg = { ...DEFAULT, ...opts }
  const idb = opts.idbFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : null)
  if (!idb) return inMemoryFallback()

  let dbPromise: Promise<IDBDatabase> | null = null
  const openDb = (): Promise<IDBDatabase> => {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
      const req = idb.open(cfg.dbName, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(cfg.storeName)) {
          const os = db.createObjectStore(cfg.storeName, { keyPath: 'id', autoIncrement: true })
          os.createIndex('by_workbook', 'workbookId', { unique: false })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('idb open failed'))
    })
    return dbPromise
  }

  return {
    async enqueue(m) {
      const db = await openDb()
      return new Promise<number>((resolve, reject) => {
        const t = db.transaction(cfg.storeName, 'readwrite')
        const store = t.objectStore(cfg.storeName)
        const req = store.add(m)
        req.onsuccess = () => resolve(req.result as number)
        req.onerror = () => reject(req.error ?? new Error('idb add failed'))
      })
    },

    async drain(workbookId) {
      const db = await openDb()
      return new Promise<QueuedMutation[]>((resolve, reject) => {
        const t = db.transaction(cfg.storeName, 'readonly')
        const store = t.objectStore(cfg.storeName)
        const out: QueuedMutation[] = []
        const idx = store.index('by_workbook')
        const c = idx.openCursor(IDBKeyRange.only(workbookId))
        c.onsuccess = () => {
          const cur = c.result
          if (cur) {
            out.push(cur.value as QueuedMutation)
            cur.continue()
          } else {
            out.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
            resolve(out)
          }
        }
        c.onerror = () => reject(c.error ?? new Error('idb cursor failed'))
      })
    },

    async remove(ids) {
      const db = await openDb()
      return new Promise<void>((resolve, reject) => {
        const t = db.transaction(cfg.storeName, 'readwrite')
        const store = t.objectStore(cfg.storeName)
        for (const id of ids) store.delete(id)
        t.oncomplete = () => resolve()
        t.onerror = () => reject(t.error ?? new Error('idb tx failed'))
      })
    },

    async size() {
      const db = await openDb()
      return new Promise<number>((resolve, reject) => {
        const t = db.transaction(cfg.storeName, 'readonly')
        const req = t.objectStore(cfg.storeName).count()
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('idb count failed'))
      })
    },

    async clear() {
      const db = await openDb()
      return new Promise<void>((resolve, reject) => {
        const t = db.transaction(cfg.storeName, 'readwrite')
        const req = t.objectStore(cfg.storeName).clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('idb clear failed'))
      })
    },
  }
}

function inMemoryFallback(): OfflineCache {
  const items: QueuedMutation[] = []
  let nextId = 1
  return {
    async enqueue(m) {
      const id = nextId++
      items.push({ ...m, id })
      return id
    },
    async drain(workbookId) {
      return items
        .filter((i) => i.workbookId === workbookId)
        .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    },
    async remove(ids) {
      const set = new Set(ids)
      for (let i = items.length - 1; i >= 0; i--) {
        const id = items[i]?.id
        if (id !== undefined && set.has(id)) items.splice(i, 1)
      }
    },
    async size() {
      return items.length
    },
    async clear() {
      items.length = 0
    },
  }
}
