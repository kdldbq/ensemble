import type { Folder, Grant, Snapshot, UniverWorkbookData, Workbook } from './types'

export interface ApiClientOpts {
  baseUrl: string
  token: () => Promise<string> | string
  fetch?: typeof fetch
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly tokenFn: () => Promise<string> | string
  private readonly fetchImpl: typeof fetch

  constructor(opts: ApiClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '')
    this.tokenFn = opts.token
    this.fetchImpl = opts.fetch ?? globalThis.fetch
  }

  private async req(path: string, init?: RequestInit & { body?: BodyInit }): Promise<Response> {
    const token = await this.tokenFn()
    // Build a plain-object header map so mock fetch can inspect it via key access.
    // Seed from any existing init.headers, then stamp Authorization with original casing.
    const existingHeaders = init?.headers ?? {}
    const headers: Record<string, string> = { ...(existingHeaders as Record<string, string>) }
    headers['Authorization'] = `Bearer ${token}`
    const res = await this.fetchImpl(this.baseUrl + path, { ...init, headers })
    if (!res.ok) {
      const text = await res.text()
      let msg = text
      try {
        msg = (JSON.parse(text) as { error?: string }).error ?? text
      } catch {
        /* keep text */
      }
      throw new Error(`ensemble ${res.status}: ${msg}`)
    }
    return res
  }

  async listWorkbooks(): Promise<{ items: Workbook[] }> {
    return (await this.req('/api/v1/workbooks')).json() as Promise<{ items: Workbook[] }>
  }

  async createWorkbook(name: string): Promise<Workbook> {
    const res = await this.req('/api/v1/workbooks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json() as Promise<Workbook>
  }

  async getWorkbook(id: string): Promise<Workbook> {
    return (await this.req(`/api/v1/workbooks/${id}`)).json() as Promise<Workbook>
  }

  async getLatestSnapshot(id: string): Promise<UniverWorkbookData | null> {
    const res = await this.req(`/api/v1/workbooks/${id}/snapshot`)
    if (res.status === 204) return null
    return res.json() as Promise<UniverWorkbookData>
  }

  async uploadSnapshot(
    workbookId: string,
    bytes: Uint8Array,
    opts: { reason?: 'auto' | 'manual' | 'named'; name?: string } = {}
  ): Promise<Snapshot> {
    const params = new URLSearchParams()
    params.set('reason', opts.reason ?? 'manual')
    if (opts.name) params.set('name', opts.name)
    const res = await this.req(`/api/v1/workbooks/${workbookId}/snapshots?${params}`, {
      method: 'POST',
      body: bytes,
    })
    return res.json() as Promise<Snapshot>
  }

  async listFolders(): Promise<{ items: Folder[] }> {
    return (await this.req('/api/v1/folders')).json() as Promise<{ items: Folder[] }>
  }
  async createFolder(input: { name: string; parentId: string | null; spaceType: 'personal' | 'shared' }): Promise<Folder> {
    const res = await this.req('/api/v1/folders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<Folder>
  }
  async renameFolder(id: string, name: string): Promise<Folder> {
    const res = await this.req(`/api/v1/folders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json() as Promise<Folder>
  }
  async moveFolder(id: string, newParentId: string | null): Promise<Folder> {
    const res = await this.req(`/api/v1/folders/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: newParentId }),
    })
    return res.json() as Promise<Folder>
  }
  async deleteFolder(id: string): Promise<void> {
    await this.req(`/api/v1/folders/${id}`, { method: 'DELETE' })
  }
  async createGrant(input: Omit<Grant, 'id' | 'tenantId' | 'grantedBy' | 'grantedAt'>): Promise<Grant> {
    const res = await this.req('/api/v1/grants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<Grant>
  }
  async deleteGrant(id: string): Promise<void> {
    await this.req(`/api/v1/grants/${id}`, { method: 'DELETE' })
  }
}
