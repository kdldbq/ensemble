/**
 * @ensemble-sheets/scim-adapter — SCIM 2.0 (RFC 7644) protocol helpers
 *
 * ensemble has no opinion on user/group storage — hosts wire their own.
 * This package gives them a typed handler so identity providers (Okta,
 * Azure AD, JumpCloud) can provision users via the standard SCIM API
 * without each host re-implementing the protocol.
 */

export type ScimResourceType = 'User' | 'Group'

export interface ScimUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User']
  id: string
  externalId?: string
  userName: string
  name?: { givenName?: string; familyName?: string }
  emails?: Array<{ value: string; primary?: boolean; type?: string }>
  active: boolean
  meta: {
    resourceType: 'User'
    created: string
    lastModified: string
    location?: string
    version?: string
  }
}

export interface ScimGroup {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group']
  id: string
  externalId?: string
  displayName: string
  members?: Array<{ value: string; display?: string }>
  meta: {
    resourceType: 'Group'
    created: string
    lastModified: string
    location?: string
    version?: string
  }
}

export interface ScimListResponse<T> {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse']
  totalResults: number
  startIndex: number
  itemsPerPage: number
  Resources: T[]
}

export interface ScimError {
  schemas: ['urn:ietf:params:scim:api:messages:2.0:Error']
  status: string
  detail: string
  scimType?: string
}

export interface ScimPatchOp {
  op: 'add' | 'remove' | 'replace'
  path?: string
  value?: unknown
}

export interface ScimStore {
  listUsers(opts: {
    startIndex: number
    count: number
    filter?: { field: 'userName' | 'externalId'; value: string } | null
  }): Promise<{ total: number; items: ScimUser[] }>
  getUser(id: string): Promise<ScimUser | null>
  createUser(user: Partial<ScimUser>): Promise<ScimUser>
  updateUser(id: string, user: Partial<ScimUser>): Promise<ScimUser | null>
  patchUser(id: string, ops: ScimPatchOp[]): Promise<ScimUser | null>
  deleteUser(id: string): Promise<boolean>

  listGroups(opts: {
    startIndex: number
    count: number
  }): Promise<{ total: number; items: ScimGroup[] }>
  getGroup(id: string): Promise<ScimGroup | null>
  createGroup(group: Partial<ScimGroup>): Promise<ScimGroup>
  updateGroup(id: string, group: Partial<ScimGroup>): Promise<ScimGroup | null>
  patchGroup(id: string, ops: ScimPatchOp[]): Promise<ScimGroup | null>
  deleteGroup(id: string): Promise<boolean>
}

export function scimError(status: number, detail: string, scimType?: string): ScimError {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
    status: String(status),
    detail,
    ...(scimType ? { scimType } : {}),
  }
}

/**
 * Parse a tiny subset of SCIM filter syntax: `userName eq "value"` /
 * `externalId eq "value"`. RFC 7644 §3.4.2.2 defines a richer grammar but
 * IdP-driven SCIM mostly uses these two equality lookups.
 */
export function parseSimpleFilter(
  filter: string | null,
): { field: 'userName' | 'externalId'; value: string } | null {
  if (!filter) return null
  const m = /^(userName|externalId)\s+eq\s+"([^"]+)"$/i.exec(filter.trim())
  if (!m?.[1] || m[2] === undefined) return null
  return { field: m[1] as 'userName' | 'externalId', value: m[2] }
}

export interface ScimResponse {
  status: number
  headers: Record<string, string>
  body: unknown
}

function ok(body: unknown, status = 200): ScimResponse {
  return { status, headers: { 'content-type': 'application/scim+json' }, body }
}

function err(status: number, detail: string, scimType?: string): ScimResponse {
  return ok(scimError(status, detail, scimType), status)
}

/**
 * Route + dispatch a SCIM request. Returns a transport-agnostic shape — host
 * adapts to Hono / Express / Fastify. Auth (Bearer token from IdP) is the
 * host's responsibility — verify before passing the request in.
 */
export async function handleScimRequest(
  req: { method: string; path: string; query?: URLSearchParams; body?: unknown },
  store: ScimStore,
): Promise<ScimResponse> {
  const segments = req.path.replace(/^\/+/, '').split('/').filter(Boolean)
  if (segments.length === 0) return err(404, 'not found')
  const [resource, id] = segments
  if (resource !== 'Users' && resource !== 'Groups') return err(404, 'unknown resource')
  const isUser = resource === 'Users'

  try {
    if (req.method === 'GET' && !id) {
      // Clamp: SCIM startIndex is 1-based per RFC 7644 §3.4.2.4; count is
      // 0-based but negative/NaN should not silently become 0 or NaN.
      const rawStart = Number(req.query?.get('startIndex') ?? '1')
      const startIndex = Number.isFinite(rawStart) && rawStart >= 1 ? Math.floor(rawStart) : 1
      const rawCount = Number(req.query?.get('count') ?? '50')
      const count =
        Number.isFinite(rawCount) && rawCount >= 0 ? Math.min(Math.floor(rawCount), 200) : 50
      if (isUser) {
        const filter = parseSimpleFilter(req.query?.get('filter') ?? null)
        const { total, items } = await store.listUsers({ startIndex, count, filter })
        const body: ScimListResponse<ScimUser> = {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
          totalResults: total,
          startIndex,
          itemsPerPage: items.length,
          Resources: items,
        }
        return ok(body)
      }
      const { total, items } = await store.listGroups({ startIndex, count })
      const body: ScimListResponse<ScimGroup> = {
        schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
        totalResults: total,
        startIndex,
        itemsPerPage: items.length,
        Resources: items,
      }
      return ok(body)
    }

    if (req.method === 'GET' && id) {
      const item = isUser ? await store.getUser(id) : await store.getGroup(id)
      return item ? ok(item) : err(404, `${resource.slice(0, -1)} not found`)
    }

    if (req.method === 'POST' && !id) {
      const item = isUser
        ? await store.createUser(req.body as Partial<ScimUser>)
        : await store.createGroup(req.body as Partial<ScimGroup>)
      return ok(item, 201)
    }

    if (req.method === 'PUT' && id) {
      const item = isUser
        ? await store.updateUser(id, req.body as Partial<ScimUser>)
        : await store.updateGroup(id, req.body as Partial<ScimGroup>)
      return item ? ok(item) : err(404, `${resource.slice(0, -1)} not found`)
    }

    if (req.method === 'PATCH' && id) {
      const ops = (req.body as { Operations?: ScimPatchOp[] } | undefined)?.Operations ?? []
      const item = isUser ? await store.patchUser(id, ops) : await store.patchGroup(id, ops)
      return item ? ok(item) : err(404, `${resource.slice(0, -1)} not found`)
    }

    if (req.method === 'DELETE' && id) {
      const okDel = isUser ? await store.deleteUser(id) : await store.deleteGroup(id)
      return okDel
        ? { status: 204, headers: {}, body: null }
        : err(404, `${resource.slice(0, -1)} not found`)
    }

    return err(405, `method ${req.method} not allowed on ${req.path}`)
  } catch (e) {
    // Log internally; expose only a generic detail to the IdP so DB constraint
    // names / stack hints / model internals don't leak in the SCIM response.
    console.error('scim-adapter: handler threw', e)
    return err(500, 'internal server error')
  }
}
