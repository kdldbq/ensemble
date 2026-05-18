import type {
  ActivityEntry,
  Comment,
  Folder,
  Grant,
  Protection,
  Snapshot,
  UniverWorkbookData,
  Version,
  Workbook,
} from './types'

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
    // Bind fetch to globalThis so it works in browser (window.fetch requires
    // its `this` to be Window; storing it as a method on `this` loses the binding).
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis)
  }

  private async req(path: string, init?: RequestInit & { body?: BodyInit }): Promise<Response> {
    const token = await this.tokenFn()
    // Build a plain-object header map so mock fetch can inspect it via key access.
    // Seed from any existing init.headers, then stamp Authorization with original casing.
    const existingHeaders = init?.headers ?? {}
    const headers: Record<string, string> = { ...(existingHeaders as Record<string, string>) }
    headers.Authorization = `Bearer ${token}`
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
    opts: { reason?: 'auto' | 'manual' | 'named'; name?: string } = {},
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
  async createFolder(input: {
    name: string
    parentId: string | null
    spaceType: 'personal' | 'shared'
  }): Promise<Folder> {
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
  async restoreFolder(id: string): Promise<Folder> {
    const res = await this.req(`/api/v1/folders/${id}/restore`, { method: 'POST' })
    return res.json() as Promise<Folder>
  }
  async reorderFolder(
    id: string,
    newPosition: number,
    newParentId?: string | null,
  ): Promise<Folder> {
    const body: { newPosition: number; newParentId?: string | null } = { newPosition }
    if (newParentId !== undefined) body.newParentId = newParentId
    const res = await this.req(`/api/v1/folders/${id}/reorder`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.json() as Promise<Folder>
  }
  async listTrashedFolders(): Promise<{ items: Folder[] }> {
    return (await this.req('/api/v1/folders/trash')).json() as Promise<{ items: Folder[] }>
  }
  async updateWorkbook(
    id: string,
    patch: { name?: string; folderId?: string | null },
  ): Promise<{ id: string; name: string; folderId: string | null }> {
    const res = await this.req(`/api/v1/workbooks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.json() as Promise<{ id: string; name: string; folderId: string | null }>
  }
  async listActivity(
    workbookId: string,
    opts: { limit?: number; before?: string } = {},
  ): Promise<{ items: ActivityEntry[] }> {
    const qs = new URLSearchParams()
    if (opts.limit !== undefined) qs.set('limit', String(opts.limit))
    if (opts.before !== undefined) qs.set('before', opts.before)
    const path = `/api/v1/workbooks/${workbookId}/activity${qs.size ? `?${qs}` : ''}`
    return (await this.req(path)).json() as Promise<{ items: ActivityEntry[] }>
  }
  async listAllActivity(
    opts: { limit?: number; before?: string } = {},
  ): Promise<{ items: ActivityEntry[] }> {
    const qs = new URLSearchParams()
    if (opts.limit !== undefined) qs.set('limit', String(opts.limit))
    if (opts.before !== undefined) qs.set('before', opts.before)
    const path = `/api/v1/activity${qs.size ? `?${qs}` : ''}`
    return (await this.req(path)).json() as Promise<{ items: ActivityEntry[] }>
  }
  async listProtections(workbookId: string): Promise<{ items: Protection[] }> {
    return (await this.req(`/api/v1/workbooks/${workbookId}/protections`)).json() as Promise<{
      items: Protection[]
    }>
  }
  async createProtection(
    workbookId: string,
    input: {
      sheetId: string
      rangeRef: string
      description?: string | null
      allowedUserIds?: string[] | null
      allowedRoles?: string[] | null
    },
  ): Promise<Protection> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/protections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<Protection>
  }
  async deleteProtection(workbookId: string, protectionId: string): Promise<void> {
    await this.req(`/api/v1/workbooks/${workbookId}/protections/${protectionId}`, {
      method: 'DELETE',
    })
  }
  async aiFormula(
    prompt: string,
    opts: { context?: string } = {},
  ): Promise<{ formula: string; warning?: string }> {
    const res = await this.req('/api/v1/ai/formula', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt, ...(opts.context ? { context: opts.context } : {}) }),
    })
    return res.json() as Promise<{ formula: string; warning?: string }>
  }
  async adminStats(): Promise<{
    tenantId: string
    generatedAt: string
    workbooks: number
    folders: number
    snapshots: number
    storageBytes: number
    activeUsers24h: number
    activeUsers7d: number
    events24h: number
    eventsByType30d: Array<{ eventType: string; count: number }>
    topActors7d: Array<{ actorId: string; count: number }>
  }> {
    const res = await this.req('/api/v1/admin/stats')
    return res.json() as Promise<{
      tenantId: string
      generatedAt: string
      workbooks: number
      folders: number
      snapshots: number
      storageBytes: number
      activeUsers24h: number
      activeUsers7d: number
      events24h: number
      eventsByType30d: Array<{ eventType: string; count: number }>
      topActors7d: Array<{ actorId: string; count: number }>
    }>
  }
  async aiBI(
    question: string,
    csv: string,
  ): Promise<{
    answer: string
    formula: string
    chart: { type: string; xColumn?: string; yColumn?: string }
    warning?: string
  }> {
    const res = await this.req('/api/v1/ai/bi', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question, csv }),
    })
    return res.json() as Promise<{
      answer: string
      formula: string
      chart: { type: string; xColumn?: string; yColumn?: string }
      warning?: string
    }>
  }
  async aiChartSuggest(csv: string): Promise<{
    type: string
    xColumn: string
    yColumns: string[]
    title: string
    rationale: string
    warning?: string
  }> {
    const res = await this.req('/api/v1/ai/chart-suggest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ csv }),
    })
    return res.json() as Promise<{
      type: string
      xColumn: string
      yColumns: string[]
      title: string
      rationale: string
      warning?: string
    }>
  }
  async aiDetectColumns(
    text: string,
  ): Promise<{ headers: string[]; delimiterPattern: string; warning?: string }> {
    const res = await this.req('/api/v1/ai/detect-columns', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    return res.json() as Promise<{
      headers: string[]
      delimiterPattern: string
      warning?: string
    }>
  }
  async listComments(
    workbookId: string,
    opts: { threadId?: string; includeResolved?: boolean } = {},
  ): Promise<{ items: Comment[] }> {
    const qs = new URLSearchParams()
    if (opts.threadId) qs.set('threadId', opts.threadId)
    if (opts.includeResolved) qs.set('include_resolved', 'true')
    const path = `/api/v1/workbooks/${workbookId}/comments${qs.size ? `?${qs}` : ''}`
    return (await this.req(path)).json() as Promise<{ items: Comment[] }>
  }
  async createComment(
    workbookId: string,
    input: {
      threadId: string
      cellRef?: string | null
      parentId?: string | null
      body: string
    },
  ): Promise<Comment> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<Comment>
  }
  async updateComment(
    workbookId: string,
    commentId: string,
    patch: { body?: string; resolved?: boolean },
  ): Promise<Comment> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/comments/${commentId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    return res.json() as Promise<Comment>
  }
  async deleteComment(workbookId: string, commentId: string): Promise<void> {
    await this.req(`/api/v1/workbooks/${workbookId}/comments/${commentId}`, {
      method: 'DELETE',
    })
  }
  async diffVersions(
    workbookId: string,
    input: { fromVersionId: string; toVersionId: string },
  ): Promise<{
    cells: Array<{
      sheetId: string
      row: number
      col: number
      op: 'added' | 'removed' | 'changed'
      from: unknown
      to: unknown
    }>
    totals: { added: number; removed: number; changed: number }
    sheetsAdded: string[]
    sheetsRemoved: string[]
  }> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/versions/diff`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<{
      cells: Array<{
        sheetId: string
        row: number
        col: number
        op: 'added' | 'removed' | 'changed'
        from: unknown
        to: unknown
      }>
      totals: { added: number; removed: number; changed: number }
      sheetsAdded: string[]
      sheetsRemoved: string[]
    }>
  }
  async readRange(
    workbookId: string,
    input: { sheetId: string; rangeRef: string },
  ): Promise<{
    sheetId: string
    rangeRef: string
    rows: number
    cols: number
    values: unknown[][]
    empty?: boolean
  }> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/range/read`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return res.json() as Promise<{
      sheetId: string
      rangeRef: string
      rows: number
      cols: number
      values: unknown[][]
      empty?: boolean
    }>
  }
  async createGrant(
    input: Omit<Grant, 'id' | 'tenantId' | 'grantedBy' | 'grantedAt' | 'hasPassword'> & {
      password?: string
    },
  ): Promise<Grant> {
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
  async listGrants(opts: { workbookId?: string; folderId?: string }): Promise<{ items: Grant[] }> {
    const qs = new URLSearchParams()
    if (opts.workbookId) qs.set('workbookId', opts.workbookId)
    else if (opts.folderId) qs.set('folderId', opts.folderId)
    else throw new Error('listGrants: workbookId or folderId required')
    return (await this.req(`/api/v1/grants?${qs}`)).json() as Promise<{ items: Grant[] }>
  }
  /** Returns true iff the password is correct (or no password is set on the grant). */
  async verifyGrantPassword(grantId: string, password: string): Promise<boolean> {
    const res = await this.req(`/api/v1/grants/${grantId}/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch((err) => {
      // 401 → wrong password; rethrow others
      if (err instanceof Error && /401/.test(err.message)) return null
      throw err
    })
    return res !== null
  }

  async listVersions(workbookId: string): Promise<{ items: Version[] }> {
    return (await this.req(`/api/v1/workbooks/${workbookId}/versions`)).json() as Promise<{
      items: Version[]
    }>
  }
  async createVersion(workbookId: string, name: string): Promise<Version> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return res.json() as Promise<Version>
  }
  async restoreVersion(workbookId: string, versionId: string): Promise<{ id: string }> {
    const res = await this.req(`/api/v1/workbooks/${workbookId}/restore/${versionId}`, {
      method: 'POST',
    })
    return res.json() as Promise<{ id: string }>
  }
}
