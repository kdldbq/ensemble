# ensemble — Design Spec

- **Status**: Draft (post-brainstorm)
- **Date**: 2026-05-15
- **Author**: kdldbq (with Claude as brainstorming partner)
- **Repo**: `/Users/cedric/Projects.localized/ensemble`
- **License (planned)**: Apache 2.0

## 1. Overview

`ensemble` is an open-source collaborative spreadsheet platform. It packages Univer (Apache 2.0) as the in-browser editor and provides a self-built backend for real-time multi-user editing, file management, and a host-pluggable permission / data-masking pipeline.

The product is designed to be **embedded into any host application**, regardless of language. EduCube (a Python/FastAPI K-12 education product) is the first integration host and proves the contract.

Key shape:

```
host application (Python/Go/Node/...)
  │
  │  JWT (host-issued)
  ▼
ensemble server (Node + TS, Hono on Node/Bun/CF Workers)
  │
  ├── REST API:  workbooks, folders, snapshots, grants
  ├── WS API:    collab room (cell-lock + mutation broadcast)
  └── Adapters:  Identity / Permission / Storage / (Event)
      └── Adapter implementations live in the host
          (TS class directly, OR Webhook endpoints in any language)

ensemble frontend
  ├── @ensemble-sheets/core    (vanilla TS — Univer wrap + WS + REST)
  ├── @ensemble-sheets/react   (<WorkbookEditor /> for React hosts)
  └── @ensemble-sheets/vue     (<WorkbookEditor /> for Vue hosts)
```

## 2. Goals & Non-Goals

### Goals (v0.1)

- G1 — **Univer-powered editor** embedded in any web host via React or Vue component.
- G2 — **xlsx round-trip**: open `.xlsx` files, edit, save back to `.xlsx`. Conversion happens client-side via SheetJS.
- G3 — **Real-time multi-user editing** with cell-level conflict avoidance (cell-lock + broadcast, not full OT).
- G4 — **Host-pluggable permissions**: host decides who can view/edit/share/delete each workbook.
- G5 — **Host-pluggable data masking**: host returns column/row/header-level mask rules; ensemble applies on every data egress (snapshot + mutation broadcast).
- G6 — **Host-pluggable storage**: blob snapshots can land on S3 / Volcengine TOS / MinIO / local FS via adapter.
- G7 — **Multi-tenant from day 1**, shared DB with `tenant_id` column + Postgres RLS.
- G8 — **Language-agnostic host integration**: Node hosts write TS adapters; Python/Go/PHP hosts implement HTTP webhook endpoints called by the built-in `WebhookAdapter`.
- G9 — **Folder-tree file organization** (personal space + tenant shared space, drag/rename/move).
- G10 — Apache 2.0 license, public GitHub repo, English-first docs with Chinese translations.

### Non-Goals (v0.1)

- N1 — True operational transformation (OT) / CRDT conflict merging. Cell-lock is sufficient for the target use cases (rarely two users edit the same cell at the same time).
- N2 — Pivot tables, advanced charts beyond Univer's `sheets-graphics`.
- N3 — Native mobile apps (web-only).
- N4 — Self-managed user identity / passwords / SSO. Host owns identity; ensemble references opaque `user_id` strings.
- N5 — Document collab beyond spreadsheets (no `docs` / `slides` editing in v0.1).
- N6 — Federation / cross-tenant sharing.

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser  (host app: React / Vue / Vanilla / Solid…)         │
│                                                              │
│  @ensemble-sheets/core         vanilla TS                           │
│   ├─ Univer OSS wrap (sheets / formula / cf / etc.)          │
│   ├─ SheetJS  ←→ Univer JSON converter                       │
│   ├─ WSClient  cell-lock + mutation broadcast                │
│   └─ ApiClient REST                                          │
│                                                              │
│  @ensemble-sheets/react   <WorkbookEditor workbookId="…" />         │
│  @ensemble-sheets/vue     <WorkbookEditor :workbook-id="…" />       │
└────────────────────────┬─────────────────────────────────────┘
                         │ REST + WebSocket  (host-issued JWT)
┌────────────────────────▼─────────────────────────────────────┐
│  ensemble server  (Node + TS, Hono, runs on Node/Bun/CF)     │
│                                                              │
│  Core modules                                                │
│   ├─ WorkbookService       metadata + snapshot CRUD          │
│   ├─ FolderService         folder tree                       │
│   ├─ CollabRoom            room lifecycle + presence         │
│   ├─ CellLockManager       per-cell lease (Redis)            │
│   ├─ MutationBroadcaster   WS fanout + seq numbering         │
│   ├─ PermissionEngine      calls adapter + applies masking   │
│   └─ SnapshotStore         incremental + named versions      │
│                                                              │
│  Adapter contracts (host implements these)                   │
│   ├─ IdentityAdapter       JWT → identity context            │
│   ├─ PermissionAdapter     capabilities + mask rules         │
│   ├─ StorageAdapter        blob storage backend              │
│   └─ EventAdapter (opt)    fire-and-forget host webhook      │
└────────────────────────┬─────────────────────────────────────┘
                         │
            ┌────────────┼──────────────┐
            ▼            ▼              ▼
         Postgres      Redis        Object Storage
         (metadata)  (lock/presence  (workbook JSON
                      mutation buf)   + version history)
```

### Repo layout (pnpm-workspaces monorepo)

```
ensemble/
  packages/
    core/                # @ensemble-sheets/core         (TS, framework-agnostic)
    react/               # @ensemble-sheets/react        (thin wrapper)
    vue/                 # @ensemble-sheets/vue          (thin wrapper)
    server/              # @ensemble-sheets/server       (Node backend)
    sdk-node/            # @ensemble-sheets/sdk-node     (host backend SDK for Node hosts)
    adapters/
      identity-jwks/     # @ensemble-sheets/identity-jwks (generic JWKS verifier)
      storage-s3/        # @ensemble-sheets/storage-s3   (S3/R2/B2/MinIO)
      storage-tos/       # @ensemble-sheets/storage-tos  (Volcengine TOS, EduCube reuse)
      storage-fs/        # @ensemble-sheets/storage-fs   (local FS, dev only)
      webhook/           # @ensemble-sheets/webhook      (Webhook* adapter wrappers)
  apps/
    demo/                # public demo (Cloudflare Workers + R2 + Neon)
    docs/                # docs site (Astro Starlight or Nextra)
  examples/
    integrate-react/
    integrate-vue/
    integrate-fastapi/   # Python host example, EduCube-shaped
  docs/
    specs/               # design docs (this file)
    decisions/           # ADRs
```

### Core decoupling principle

`@ensemble-sheets/server` knows **nothing** about teachers / classes / campuses. All host business semantics flow through Adapter interfaces. EduCube integration = three adapter implementations + one `<WorkbookEditor>` mount.

## 4. Data Model

### Principle: ensemble does NOT own user identity

All `user_id` values are opaque strings supplied by the host via `IdentityAdapter`. No users table.

### Tables

```sql
tenants                                  -- ensemble's tenancy unit
  id              uuid PK
  name            text
  created_at      timestamptz

folders                                  -- folder tree
  id              uuid PK
  tenant_id       uuid FK tenants
  parent_id       uuid FK folders (self) NULL = root
  name            text
  owner_id        text                   -- host user_id, NOT a FK
  space_type      enum: personal | shared
  created_at, updated_at
  is_deleted      boolean
  UNIQUE (tenant_id, parent_id, name) WHERE NOT is_deleted

workbooks                                -- spreadsheet files
  id                    uuid PK
  tenant_id             uuid FK
  folder_id             uuid FK folders     NULL = space root
  name                  text
  owner_id              text                -- host user_id
  current_snapshot_id   uuid FK snapshots   NULL
  created_at, updated_at
  is_deleted            boolean

snapshots                                -- full workbook JSON dumps
  id              uuid PK
  workbook_id     uuid FK
  storage_key     text                   -- key in object storage
  size_bytes      bigint
  created_by      text
  created_at      timestamptz
  reason          enum: auto | manual | named
  name            text NULL              -- for named versions ("Midterm v2")

mutations                                -- collab mutation log
  id              bigint PK
  workbook_id     uuid FK
  seq_num         bigint                 -- monotonic per-workbook, server-assigned
  user_id         text
  applied_at      timestamptz
  payload         jsonb                  -- raw Univer mutation, NOT pre-masked
  INDEX (workbook_id, seq_num)

share_grants                             -- access grants
  id              uuid PK
  tenant_id       uuid FK
  resource_type   enum: folder | workbook
  resource_id     uuid                   -- folders.id or workbooks.id
  grantee_type    enum: user | tenant_member | public_link
  grantee_id      text NULL              -- user_id, or random token for public_link
  permission      enum: view | edit | manage
  expires_at      timestamptz NULL
  granted_by      text
  granted_at      timestamptz
```

### Locked-in decisions

- **Multi-tenant via shared DB + `tenant_id` column + Postgres RLS**. Simpler than schema-per-tenant; RLS makes accidental cross-tenant leaks structurally impossible.
- **Masking is dynamic, never cached**: applied on every snapshot egress and every mutation broadcast. Stored data is always raw.
- **Folder grants inherit via query-time recursion**, not denormalized in tables.

### Deferred (YAGNI)

- `groups` / `group_members` (host usually has its own grouping)
- `audit_log` (Sprint 4+)
- `import_jobs` (only if >50MB xlsx becomes a real use case)

## 5. Adapter Interfaces

### `IdentityAdapter`

```ts
interface IdentityContext {
  tenantId: string         // ensemble tenant
  userId: string           // host's user identifier (opaque)
  displayName?: string
  email?: string
  roles?: string[]         // host-defined labels, ensemble does not interpret
  custom?: Record<string, unknown>
}

interface IdentityAdapter {
  resolveFromToken(token: string): Promise<IdentityContext>
}
```

### `PermissionAdapter`

```ts
interface ResourceRef {
  type: 'folder' | 'workbook'
  id: string
  tenantId: string
}

interface Capability {
  canView: boolean
  canEdit: boolean
  canShare: boolean
  canDelete: boolean
}

interface MaskRule {
  match:
    | { type: 'column'; sheet: '*' | string; column: string }
    | { type: 'header'; sheet: '*' | string; headerText: string }
    | { type: 'row';    sheet: '*' | string; where: { field: string; op: 'eq'|'in'; value: unknown } }
  action:
    | { type: 'redact'; replacement: string }
    | { type: 'hash' }
    | { type: 'remove' }
}

interface PermissionAdapter {
  getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability>
  getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]>
  filterListVisibility?(
    identity: IdentityContext,
    scope: 'folders'|'workbooks'
  ): Promise<{ allowedIds?: string[] }>
}
```

### `StorageAdapter`

```ts
interface StorageAdapter {
  put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
  signedPutUrl?(key: string, ttlSec?: number): Promise<string>
  signedGetUrl?(key: string, ttlSec?: number, filename?: string): Promise<string>
}
```

### `EventAdapter` (optional)

```ts
type EnsembleEvent =
  | { type: 'workbook.created'; workbookId: string; userId: string; at: string }
  | { type: 'workbook.opened';  workbookId: string; userId: string; at: string }
  | { type: 'workbook.edited';  workbookId: string; userId: string; batchedOpsCount: number; at: string }
  | { type: 'folder.created';   folderId: string;   userId: string; at: string }
  | { type: 'share.granted';    grantId: string;    grantedBy: string; at: string }

interface EventAdapter {
  publish(event: EnsembleEvent): Promise<void>  // fire-and-forget
}
```

### How adapters are wired

**Node host (direct TS implementation):**

```ts
import { createServer } from '@ensemble-sheets/server'

const server = createServer({
  identity:   new MyJwksIdentity({ jwksUrl: 'https://host/.well-known/jwks.json' }),
  permission: new MyPermissionLogic(),
  storage:    new S3Storage({ bucket: 'ensemble-prod' }),
  database:   { url: process.env.DATABASE_URL },
  redis:      { url: process.env.REDIS_URL },
})
server.listen({ port: 3000 })
```

**Non-Node host (WebhookAdapter):**

```ts
import { WebhookAdapter, createServer } from '@ensemble-sheets/server'
import { TosStorage } from '@ensemble-sheets/storage-tos'

const server = createServer({
  identity:   new WebhookAdapter({ url: 'https://educube/api/ensemble/identity',   secret: process.env.HOST_SECRET }),
  permission: new WebhookAdapter({ url: 'https://educube/api/ensemble/permission', secret: process.env.HOST_SECRET }),
  storage:    new TosStorage({ ak, sk, bucket, endpoint }),
})
```

The host (e.g. EduCube FastAPI) exposes endpoints matching the adapter contract:

```
POST /api/ensemble/identity     -> { token }            => IdentityContext
POST /api/ensemble/permission   -> { identity, resource, op: 'capabilities' | 'mask_rules' }
                                                          => Capability | MaskRule[]
POST /api/ensemble/event        -> EnsembleEvent        => {}
```

**Total EduCube-side Python additions to integrate**: ~200 lines (3 endpoints + JWT issuance + Vue view embed).

## 6. Folder Tree + Sharing

### Two root spaces per user

- `personal` root: virtual root scoped to `(tenant_id, owner_id = user)`
- `shared` root: virtual root scoped to `(tenant_id)`, visible to anyone in tenant

### Operations

- Create folder under any allowed parent
- Rename
- Move (changes `parent_id`, must reject self-cycles via recursive ancestor check)
- Soft delete (sets `is_deleted = true`, kept 30 days for recovery)

### Share grants resolution

When resolving "can user U view workbook W":

1. Is U the workbook owner? → yes
2. Is there a `share_grants` row with `resource_id = W` and (`grantee_id = U.userId` OR `grantee_type = tenant_member`)? → check permission level
3. Walk up W's folder chain; for each ancestor folder, check `share_grants` matching → first match wins
4. Otherwise → no

`public_link` grants are matched by request-supplied token.

### Endpoints

```
GET    /api/v1/folders                       list visible folders (filtered)
POST   /api/v1/folders                       create
PATCH  /api/v1/folders/:id                   rename / move
DELETE /api/v1/folders/:id                   soft delete

GET    /api/v1/workbooks                     list visible workbooks
POST   /api/v1/workbooks                     create blank
POST   /api/v1/workbooks/import              upload xlsx (or send JSON)
GET    /api/v1/workbooks/:id                 snapshot (after masking)
GET    /api/v1/workbooks/:id/versions        list named versions
POST   /api/v1/workbooks/:id/versions        create named version
POST   /api/v1/workbooks/:id/restore/:ver    restore (creates new snapshot)
DELETE /api/v1/workbooks/:id                 soft delete

POST   /api/v1/grants                        grant access
DELETE /api/v1/grants/:id                    revoke
```

## 7. Realtime Collab Protocol

### Approach: cell-lock + broadcast (not full OT)

Rejected full OT because: (a) implementing OT for Univer's mutation set is ~6-8 weeks of risky engineering with subtle bugs, (b) target use case (e.g., teachers editing different students/columns in the same gradebook) almost never conflicts on the same cell, (c) cell-lock UX ("X is editing this cell, wait or pick another") is intelligible to non-technical users.

### Connection

```
Client → WSS /api/v1/ws/:workbookId
        ?token=<host-issued JWT>
```

1. Server runs `IdentityAdapter.resolveFromToken` → identity
2. Server runs `PermissionAdapter.getCapabilities` → must have `canView`
3. Server adds client to in-memory room map
4. Server sends `welcome` with:
   - current snapshot (after masking for this user)
   - current `seq_num`
   - current presence list (other users in room)
   - current lock map (which cells are locked by whom)

### Editing flow

```
Client                                    Server (CollabRoom)
─────                                    ─────────────────
1. User selects cell B5 to edit
   ───►  acquire_lock { region: B5..B5 }
                                       Check Redis lock table for B5
                                       If free or owned by self:
                                         SET ensemble:lock:<wbid>:B5 = userId
                                            EX 30
                                       Broadcast `lock_acquired` to room
   ◄─── lock_granted { region, owner, ttl=30 }
   ◄─── (other clients) lock_acquired { region, owner }

2. User types "85"
   ───►  submit_mutation { client_seq, payload: <Univer mutation> }
                                       Check lock matches user
                                       Validate mutation shape
                                       seq_num := room.nextSeq()
                                       INSERT mutations(workbook_id, seq_num, ...)
                                       For each other client in room:
                                         masked = applyMaskRules(payload,
                                                                  client.maskRules)
                                         send `apply_mutation` { seq_num, masked }
                                       Lock TTL renewed (30s)
   ◄─── mutation_accepted { client_seq, seq_num }
   ◄─── (others) apply_mutation { seq_num, payload }

3. User clicks elsewhere
   ───►  release_lock { region }
                                       DEL ensemble:lock:<wbid>:B5
                                       Broadcast `lock_released`
```

### Presence

- Every 5s, client sends `presence_heartbeat { cursor: {sheet, row, col}, selection: [...] }`
- Server fanouts to room (no DB write)
- On disconnect / 15s no heartbeat → server removes from presence + releases all locks → broadcasts `user_left`

### Reconnect

Client sends `last_seq_num`. Server:
- If `current_seq - last_seq <= N` (e.g. 200): replay mutations[last_seq+1 .. current_seq] (after masking)
- Else: send full fresh snapshot

### Persistence

- Mutations are written to Postgres synchronously before broadcast (durability).
- Auto-snapshot trigger: every 100 mutations or 5 minutes of inactivity.
- Named snapshots: user explicitly calls `POST /workbooks/:id/versions { name }`.

## 8. Mask Application

### Two egress points

1. **Snapshot egress** — when client opens a workbook:
   - Fetch snapshot blob from `StorageAdapter`
   - Parse Univer JSON
   - For each `MaskRule` matching this workbook + user → mutate cell values
   - Send transformed JSON to client

2. **Mutation broadcast egress** — during collab:
   - Server receives mutation from sender
   - For each recipient in room (different from sender):
     - Look up that recipient's cached `MaskRule[]` (refresh every 60s or on permission change)
     - Apply rules to the mutation payload → produce per-recipient view
     - Send that view to recipient

### Mask actions

| Action | Effect |
|--------|--------|
| `redact` | `cell.v = replacement` (e.g., "***") |
| `hash` | `cell.v = "#" + sha256(originalString).slice(0, 8)` |
| `remove` | `cell.v = null` |

### Match types

- `column`: matches by column letter (A, B, ..., AA, ...). Applies to all rows in matching sheet(s).
- `header`: matches by row 0 / first row text. Useful when columns may be reordered.
- `row`: matches rows where `parsed_row[field]` satisfies predicate. E.g., `{ field: "subject", op: "eq", value: "数学" }` masks the entire row's cells where subject is math.

### Important invariants

- **Stored data is always raw**. Mask happens only on the wire / on render path. Audit trail is intact.
- **Masks differ per recipient**. Two users opening the same workbook may see different `***` patterns.
- **Cache is fine-grained**: per (user, workbook) tuple, 60s TTL. Permission change → invalidate via WS notification.

## 9. Phased Delivery

### Sprint 1 — "It opens" (3-4 weeks)

- Repo scaffold: pnpm workspaces, TS strict, vitest, biome, Changesets
- `@ensemble-sheets/core`:
  - Univer wrapper API
  - SheetJS xlsx ↔ Univer JSON converter
  - REST client
  - WS client (just connect + welcome, no collab yet)
- `@ensemble-sheets/vue` + `@ensemble-sheets/react`: `<WorkbookEditor workbookId="..." />`
- `@ensemble-sheets/server`:
  - Hono routing
  - Drizzle + Postgres
  - Workbook CRUD REST endpoints
  - All 4 adapter interfaces defined (impl can throw "not implemented")
  - `@ensemble-sheets/storage-s3`, `@ensemble-sheets/storage-fs` reference impls
  - `@ensemble-sheets/webhook` (the `WebhookAdapter` for non-Node hosts)
- **No collab, no masking yet** — single-user only
- 90%+ unit test coverage on `@ensemble-sheets/core` and `@ensemble-sheets/server`
- Demo deploy: open a workbook, edit, save snapshot to S3, reload

### Sprint 2 — "Permission + Folder" (3-4 weeks)

- Multi-tenant: every table has `tenant_id`, Postgres RLS policies, every query helper requires explicit tenant
- `IdentityAdapter` first reference impl: `@ensemble-sheets/identity-jwks`
- `PermissionAdapter` contract enforced on every endpoint
- Folder CRUD (create, rename, move, delete, list)
- Share grants table + grant resolution logic (with ancestor walk)
- Frontend: folder navigator component (Vue + React versions)
- **Snapshot masking** (MaskRule applied on `GET /workbooks/:id`)
- Integration tests with Testcontainers (real Postgres)
- Demo: two users see different masked views of same workbook

### Sprint 3 — "Realtime" (4-5 weeks)

- WebSocket upgrade handler (Hono adapter)
- `CollabRoom` class: in-memory room state + Redis-backed lock state
- `CellLockManager`: acquire / release / TTL renew
- `MutationBroadcaster`: per-recipient masked broadcast
- Mutation persistence + replay protocol
- Reconnect with seq_num resume
- Client: lock UI (locked cells show owner badge + tooltip)
- Backpressure: rate limit mutation send per client (e.g., 30 ops/sec hard cap)
- Multi-client integration tests (spawn N headless browsers in CI)
- Demo: 5 browsers collaborating, masked columns differ per user

### Sprint 4 — "Polish + ship" (3-4 weeks)

- Named version history UI + restore
- Server-side xlsx export (SheetJS via Node, useful for large files / scheduled exports)
- `EventAdapter` reference impl + webhook payload spec
- Docs site (Astro Starlight)
- Public Cloudflare Workers demo
- **EduCube dogfood**: 3 FastAPI adapter endpoints + 1 Vue view in EduCube proper
- License headers + LICENSE + NOTICE + CONTRIBUTING + first GitHub release v0.1.0

**Total estimate**: 13-16 weeks for v0.1, one full-time engineer.

## 10. Testing Strategy

### Unit (target 90%+ per-file coverage)

- MaskRule application: each rule type × each match scope × edge cases (null cells, sheet not found, malformed value)
- Capability check matrix: each `Permission.canX` × each grant type
- Folder ops: move-into-descendant rejection, name uniqueness in soft-delete cases
- Collab protocol state machine: lock acquisition / TTL / contention / release
- Seq num monotonicity under concurrent mutations

### Integration (target 90%+ on critical paths)

- Use Testcontainers for Postgres + Redis
- Multi-tenant isolation: tenant A queries cannot leak tenant B data, verified by raw SQL probe
- End-to-end mutation flow: 2 clients edit, both see each other
- `WebhookAdapter` against stub HTTP server, verify request shape

### E2E (Playwright, critical user flows)

- Open workbook → edit cell → reload → see persisted change
- Two browser contexts collaborating → see each other's edits + lock
- Share workbook view-only → second context cannot edit
- Masked column shows `***` for restricted user but raw value for owner

### Adapter conformance suite

- Publish `@ensemble-sheets/adapter-conformance` test package
- Any host adapter implementation (Node TS class OR HTTP endpoints) runs this suite to verify contract correctness
- EduCube's Python endpoints run it via pytest (HTTP harness)

### Performance (Sprint 4, optional)

- k6 load test: 100 concurrent users in 1 workbook; mutation broadcast p95 latency < 200ms
- Memory: 10K workbooks open simultaneously; server RSS < 4GB

## 11. Open Questions / TBD

1. **Product name confirmation** — `ensemble` is the working name; revisit before v0.1 GA. Verify trademark search before public release.
2. **GitHub organization** — personal account (`kdldbq`) vs new org. Decide before first public commit.
3. **Domain** — `ensemble.dev`? `getensemble.com`? `ensemble.sh`? Cheap to register all three, decide before docs site.
4. **Public link grants** — UX details: anyone with link vs anyone in tenant with link; expiration default; password-protect?
5. **Permission change propagation** — when host changes a user's role, how does ensemble find out fast? Polling? Webhook from host? Decide in Sprint 2.
6. **xlsx large file ceiling** — set explicit max (e.g., 10MB / 100K cells) and reject larger uploads with clear error.
7. **CRDT path** — if cell-lock proves insufficient, evaluate Yjs adoption in Sprint 3+1. Not a v0.1 commitment.

## 12. Decision Log (Considered & Rejected)

| Decision | Chosen | Rejected | Why |
|----------|--------|----------|-----|
| Frontend library | Univer OSS (Apache 2.0) | Luckysheet, Handsontable | Univer most actively maintained, framework-agnostic core, mutation system enables collab |
| Collab approach | Cell-lock + broadcast | Full OT, Yjs/CRDT | OT too complex for v0.1; Yjs has impedance mismatch with Univer's imperative mutations |
| xlsx conversion | Client-side (SheetJS in browser) | Server-side (openpyxl/SheetJS-Node) | Saves server memory; avoids upload size restrictions |
| Backend lang | Node + TS | Python (FastAPI), Go, Rust | Best WS ecosystem for OSS adoption; type-share with frontend |
| Frontend SDK | Headless TS core + React + Vue | React-only, Vue-only, vanilla-only | React for global reach, Vue for China + dogfood, core is shared |
| Coupling to EduCube | Standalone product (new repo, multi-tenant, adapters) | Embedded feature, extraction-ready | User chose: maximize OSS reach, accept higher v0.1 cost |
| License | Apache 2.0 | BSL, closed | Maximizes adoption; EduCube can stay closed while depending on it |
| Multi-tenant | Shared DB + tenant_id + RLS | Schema-per-tenant, DB-per-tenant | Simpler ops; RLS makes leaks structurally impossible |
| Masking timing | Snapshot egress + mutation broadcast egress (dynamic) | Pre-masked cached snapshots | Pre-cache combinatorial blowup; users see latest rules |
| Adapter shape | TS interfaces + built-in WebhookAdapter | Configuration-driven (YAML) | Permission logic needs full programming language |

## 13. Next Steps

1. **User reviews this spec** (you're reading it).
2. **Open a fresh session in `/Users/cedric/Projects.localized/ensemble`** and run `/superpowers:writing-plans` (or `/ecc:plan`) with this spec as input to produce a concrete implementation plan with TDD checkpoints for Sprint 1.
3. **Pre-implementation chores** (before Sprint 1 begins):
   - Create GitHub repo + push initial commit
   - Reserve npm `@ensemble` scope (publish placeholder packages)
   - Register at least one domain
   - Set up GitHub Actions skeleton (lint + test + changesets)
