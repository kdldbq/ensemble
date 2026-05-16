interface Pending<T> { resolve: (v: T) => void; reject: (e: Error) => void }

export interface WelcomeFrame {
  type: 'welcome'
  workbookId: string
  seqNum: number
  snapshot: unknown | null
  presence?: unknown[]
  locks?: unknown[]
}

export interface ErrorFrame {
  type: 'error'
  code: string
  message?: string
}

export interface WsClientOpts {
  url: string
  workbookId: string
  token: () => string | Promise<string>
  WebSocketImpl?: typeof WebSocket
}

export class WsClient {
  private readonly opts: WsClientOpts
  private socket: WebSocket | null = null
  private clientSeq = 0
  private pendingLocks = new Map<string, Pending<{ acquired: boolean; ownerId: string; ttlSec: number }>>()
  private pendingMutations = new Map<number, Pending<{ clientSeq: number; seqNum: number }>>()
  private applyListeners: Array<(f: { seqNum: number; userId: string; payload: unknown }) => void> = []
  private lockListeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []

  constructor(opts: WsClientOpts) {
    this.opts = opts
  }

  connect(): Promise<WelcomeFrame> {
    const tokenOrPromise = this.opts.token()
    // If token is synchronous, build the socket immediately (no microtask delay)
    // so callers can inspect the socket reference right after connect() returns.
    if (typeof tokenOrPromise === 'string') {
      return this._buildSocket(tokenOrPromise)
    }
    return tokenOrPromise.then((token) => this._buildSocket(token))
  }

  private _buildSocket(token: string): Promise<WelcomeFrame> {
    const url = `${this.opts.url.replace(/\/$/, '')}/api/v1/ws/${this.opts.workbookId}?token=${encodeURIComponent(token)}`
    /* v8 ignore next — browser-only fallback; tests always supply WebSocketImpl */
    const Ctor = this.opts.WebSocketImpl ?? WebSocket
    const ws = new Ctor(url)
    this.socket = ws
    return new Promise<WelcomeFrame>((resolve, reject) => {
      ws.addEventListener('message', (ev) => {
        try {
          const frame = JSON.parse((ev as MessageEvent).data as string) as WelcomeFrame | ErrorFrame
          if (frame.type === 'welcome') {
            this.attachDemuxer(ws)
            resolve(frame)
          } else if (frame.type === 'error') reject(new Error(frame.code))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
      ws.addEventListener('error', () => reject(new Error('ws error')))
      ws.addEventListener('close', () => reject(new Error('ws closed before welcome')))
    })
  }

  private attachDemuxer(ws: WebSocket): void {
    ws.addEventListener('message', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data as string) as { type: string } & Record<string, unknown>
        if (frame.type === 'lock_granted' || frame.type === 'lock_denied') {
          const region = frame.region as string
          const p = this.pendingLocks.get(region)
          if (p) {
            p.resolve({
              acquired: frame.type === 'lock_granted',
              ownerId: (frame.ownerId as string) ?? '',
              ttlSec: (frame.ttlSec as number) ?? 30,
            })
            this.pendingLocks.delete(region)
          }
        } else if (frame.type === 'mutation_accepted') {
          const cs = frame.clientSeq as number
          const p = this.pendingMutations.get(cs)
          if (p) {
            p.resolve({ clientSeq: cs, seqNum: frame.seqNum as number })
            this.pendingMutations.delete(cs)
          }
        } else if (frame.type === 'apply_mutation') {
          for (const cb of this.applyListeners) {
            cb({
              seqNum: frame.seqNum as number,
              userId: frame.userId as string,
              payload: frame.payload,
            })
          }
        }
        if (frame.type === 'lock_acquired' || frame.type === 'lock_released') {
          for (const cb of this.lockListeners) cb(frame)
        }
      } catch { /* ignore */ }
    })
  }

  async acquireLock(region: string): Promise<{ acquired: boolean; ownerId: string; ttlSec: number }> {
    if (!this.socket) throw new Error('not connected')
    return new Promise((resolve, reject) => {
      this.pendingLocks.set(region, { resolve, reject })
      this.socket!.send(JSON.stringify({ type: 'acquire_lock', region }))
    })
  }

  releaseLock(region: string): void {
    this.socket?.send(JSON.stringify({ type: 'release_lock', region }))
  }

  async submitMutation(input: { region: string; payload: unknown }): Promise<{ clientSeq: number; seqNum: number }> {
    if (!this.socket) throw new Error('not connected')
    const cs = ++this.clientSeq
    return new Promise((resolve, reject) => {
      this.pendingMutations.set(cs, { resolve, reject })
      this.socket!.send(JSON.stringify({ type: 'submit_mutation', clientSeq: cs, region: input.region, payload: input.payload }))
    })
  }

  onApplyMutation(cb: (f: { seqNum: number; userId: string; payload: unknown }) => void): () => void {
    this.applyListeners.push(cb)
    return () => { this.applyListeners = this.applyListeners.filter((x) => x !== cb) }
  }

  onLockEvent(cb: (f: { type: 'lock_acquired' | 'lock_released' } & Record<string, unknown>) => void): () => void {
    this.lockListeners.push(cb as (f: { type: string } & Record<string, unknown>) => void)
    return () => { this.lockListeners = this.lockListeners.filter((x) => x !== cb) }
  }

  sendHeartbeat(cursor?: { sheet: string; row: number; col: number }): void {
    this.socket?.send(JSON.stringify({ type: 'presence_heartbeat', ...(cursor ? { cursor } : {}) }))
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }
}
