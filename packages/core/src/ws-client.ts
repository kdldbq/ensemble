interface Pending<T> {
  resolve: (v: T) => void
  reject: (e: Error) => void
}

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
  /**
   * Auto-reconnect config. Default: enabled with exponential backoff
   * 200ms → 400ms → 800ms → 1.6s … capped at 30s.
   */
  reconnect?:
    | false
    | {
        initialDelayMs?: number
        maxDelayMs?: number
        maxAttempts?: number
      }
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline'

export interface PresenceEntry {
  clientId: string
  userId: string
  lastSeen?: number
  cursor?: { sheet: string; row: number; col: number }
  selection?: unknown
}

export interface NotificationFrame {
  type: 'notification'
  kind: string
  workbookId: string
  recipients: string[]
  extra?: Record<string, unknown>
  ts: string
}

export class WsClient {
  private readonly opts: WsClientOpts
  private socket: WebSocket | null = null
  private clientSeq = 0
  private pendingLocks = new Map<
    string,
    Pending<{ acquired: boolean; ownerId: string; ttlSec: number }>
  >()
  private pendingMutations = new Map<number, Pending<{ clientSeq: number; seqNum: number }>>()
  private applyListeners: Array<(f: { seqNum: number; userId: string; payload: unknown }) => void> =
    []
  private lockListeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []
  private presenceListeners: Array<(entries: PresenceEntry[]) => void> = []
  private notificationListeners: Array<(frame: NotificationFrame) => void> = []
  private stateListeners: Array<(state: ConnectionState) => void> = []
  /** Highest seqNum we've observed; replayed to the server on reconnect. */
  private lastSeqNum = 0
  private state: ConnectionState = 'offline'
  private closedByUser = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(opts: WsClientOpts) {
    this.opts = opts
  }

  private setState(next: ConnectionState): void {
    if (this.state === next) return
    this.state = next
    for (const cb of this.stateListeners) {
      try {
        cb(next)
      } catch {
        /* swallow */
      }
    }
  }

  connect(): Promise<WelcomeFrame> {
    this.closedByUser = false
    this.setState('connecting')
    const tokenOrPromise = this.opts.token()
    if (typeof tokenOrPromise === 'string') {
      return this._buildSocket(tokenOrPromise)
    }
    return tokenOrPromise.then((token) => this._buildSocket(token))
  }

  /** Subscribe to connection state changes. Returns unsubscribe. */
  onConnectionChange(cb: (state: ConnectionState) => void): () => void {
    this.stateListeners.push(cb)
    // Fire current state immediately so consumers don't miss the initial value.
    try {
      cb(this.state)
    } catch {
      /* swallow */
    }
    return () => {
      this.stateListeners = this.stateListeners.filter((x) => x !== cb)
    }
  }

  /** Current connection state. */
  connectionState(): ConnectionState {
    return this.state
  }

  /** Highest mutation seqNum applied locally. Used for replay-on-reconnect. */
  lastAppliedSeqNum(): number {
    return this.lastSeqNum
  }

  private _buildSocket(token: string): Promise<WelcomeFrame> {
    const sinceQs = this.lastSeqNum > 0 ? `&last_seq=${this.lastSeqNum}` : ''
    const url = `${this.opts.url.replace(/\/$/, '')}/api/v1/ws/${this.opts.workbookId}?token=${encodeURIComponent(token)}${sinceQs}`
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
            this.reconnectAttempts = 0
            this.setState('connected')
            this.lastSeqNum = Math.max(this.lastSeqNum, frame.seqNum)
            resolve(frame)
          } else if (frame.type === 'error') reject(new Error(frame.code))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
      ws.addEventListener('error', () => reject(new Error('ws error')))
      ws.addEventListener('close', () => {
        // If close came BEFORE welcome resolved, the promise rejects below.
        // After welcome, we schedule a reconnect (unless user called .close()).
        this.socket = null
        if (this.state === 'connected' && !this.closedByUser) {
          this.scheduleReconnect()
        }
        reject(new Error('ws closed before welcome'))
      })
    })
  }

  private scheduleReconnect(): void {
    if (this.opts.reconnect === false) {
      this.setState('offline')
      return
    }
    const cfg = (this.opts.reconnect ?? {}) as {
      initialDelayMs?: number
      maxDelayMs?: number
      maxAttempts?: number
    }
    const initial = cfg.initialDelayMs ?? 200
    const max = cfg.maxDelayMs ?? 30_000
    const cap = cfg.maxAttempts ?? Number.POSITIVE_INFINITY
    if (this.reconnectAttempts >= cap) {
      this.setState('offline')
      return
    }
    this.setState('reconnecting')
    const delay = Math.min(max, initial * 2 ** this.reconnectAttempts)
    this.reconnectAttempts += 1
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      // Best-effort: drop any pending RPC promises so callers don't hang.
      // Server-side replay will re-apply mutations via apply_mutation frames.
      for (const p of this.pendingLocks.values()) p.reject(new Error('reconnecting'))
      this.pendingLocks.clear()
      for (const p of this.pendingMutations.values()) p.reject(new Error('reconnecting'))
      this.pendingMutations.clear()
      this.connect().catch(() => {
        // _buildSocket → close handler will re-schedule via scheduleReconnect()
      })
    }, delay)
  }

  private attachDemuxer(ws: WebSocket): void {
    ws.addEventListener('message', (ev) => {
      try {
        const frame = JSON.parse((ev as MessageEvent).data as string) as { type: string } & Record<
          string,
          unknown
        >
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
          const seqNum = frame.seqNum as number
          if (seqNum > this.lastSeqNum) this.lastSeqNum = seqNum
          for (const cb of this.applyListeners) {
            cb({
              seqNum,
              userId: frame.userId as string,
              payload: frame.payload,
            })
          }
        }
        if (frame.type === 'lock_acquired' || frame.type === 'lock_released') {
          for (const cb of this.lockListeners) cb(frame)
        } else if (frame.type === 'presence_update') {
          const entries = Array.isArray(frame.entries) ? (frame.entries as PresenceEntry[]) : []
          for (const cb of this.presenceListeners) cb(entries)
        } else if (frame.type === 'notification') {
          const nf: NotificationFrame = {
            type: 'notification',
            kind: String(frame.kind ?? ''),
            workbookId: String(frame.workbookId ?? ''),
            recipients: Array.isArray(frame.recipients) ? (frame.recipients as string[]) : [],
            ts: String(frame.ts ?? ''),
            ...(frame.extra && typeof frame.extra === 'object'
              ? { extra: frame.extra as Record<string, unknown> }
              : {}),
          }
          for (const cb of this.notificationListeners) cb(nf)
        }
      } catch {
        /* ignore */
      }
    })
  }

  onPresence(cb: (entries: PresenceEntry[]) => void): () => void {
    this.presenceListeners.push(cb)
    return () => {
      this.presenceListeners = this.presenceListeners.filter((x) => x !== cb)
    }
  }

  onNotification(cb: (frame: NotificationFrame) => void): () => void {
    this.notificationListeners.push(cb)
    return () => {
      this.notificationListeners = this.notificationListeners.filter((x) => x !== cb)
    }
  }

  async acquireLock(
    region: string,
  ): Promise<{ acquired: boolean; ownerId: string; ttlSec: number }> {
    if (!this.socket) throw new Error('not connected')
    return new Promise((resolve, reject) => {
      this.pendingLocks.set(region, { resolve, reject })
      this.socket?.send(JSON.stringify({ type: 'acquire_lock', region }))
    })
  }

  releaseLock(region: string): void {
    this.socket?.send(JSON.stringify({ type: 'release_lock', region }))
  }

  async submitMutation(input: { region: string; payload: unknown }): Promise<{
    clientSeq: number
    seqNum: number
  }> {
    if (!this.socket) throw new Error('not connected')
    const cs = ++this.clientSeq
    return new Promise((resolve, reject) => {
      this.pendingMutations.set(cs, { resolve, reject })
      this.socket?.send(
        JSON.stringify({
          type: 'submit_mutation',
          clientSeq: cs,
          region: input.region,
          payload: input.payload,
        }),
      )
    })
  }

  onApplyMutation(
    cb: (f: { seqNum: number; userId: string; payload: unknown }) => void,
  ): () => void {
    this.applyListeners.push(cb)
    return () => {
      this.applyListeners = this.applyListeners.filter((x) => x !== cb)
    }
  }

  onLockEvent(
    cb: (f: { type: 'lock_acquired' | 'lock_released' } & Record<string, unknown>) => void,
  ): () => void {
    this.lockListeners.push(cb as (f: { type: string } & Record<string, unknown>) => void)
    return () => {
      this.lockListeners = this.lockListeners.filter((x) => x !== cb)
    }
  }

  sendHeartbeat(cursor?: { sheet: string; row: number; col: number }): void {
    this.socket?.send(JSON.stringify({ type: 'presence_heartbeat', ...(cursor ? { cursor } : {}) }))
  }

  close(): void {
    this.closedByUser = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    this.socket?.close()
    this.socket = null
    this.setState('offline')
  }

  /** Whether a socket is currently attached and assumed OPEN. */
  isConnected(): boolean {
    return this.socket !== null
  }
}
