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
          if (frame.type === 'welcome') resolve(frame)
          else if (frame.type === 'error') reject(new Error(frame.code))
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)))
        }
      })
      ws.addEventListener('error', () => reject(new Error('ws error')))
      ws.addEventListener('close', () => reject(new Error('ws closed before welcome')))
    })
  }

  close(): void {
    this.socket?.close()
    this.socket = null
  }
}
