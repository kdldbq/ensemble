# ensemble — usage guide

> **Status**: v0.2.0 is the first public npm release. API is `0.x` so minor
> bumps (`0.3.0`, `0.4.0`) may make breaking changes — pin the version you
> ship against. Patch releases (`0.2.1`) stay compatible.

## What this is

A collaborative spreadsheet SDK built on [Univer](https://univer.ai), with a
[Hono](https://hono.dev) server and pluggable adapters
(identity / permission / storage / event / risk / template / OCR / PDF / LLM /
agent-policy) so a host application keeps full control of auth, data, and
policy. **Scope is locked to spreadsheets** — doc / slide / form / PDF /
mindmap / flowchart / smart-canvas are permanent non-goals.

Two modes:

| Mode | Client | Server | Needs Redis | Needs WS bridge |
|---|---|---|---|---|
| **Single-user** | `mountWorkbookEditor({ collab: false })` | `createServer({ collab: false })` | ❌ | ❌ |
| **Multi-user collab** | `mountWorkbookEditor({ ... })` (default) | `createServer({ ... })` (default) | ✅ | ✅ |

## Install

```bash
# Client — pick a framework wrapper
pnpm add @ensemble-sheets/core @ensemble-sheets/react
# or
pnpm add @ensemble-sheets/core @ensemble-sheets/vue
# or use @ensemble-sheets/core directly without a wrapper

# Server (optional — only if you're running your own backend)
pnpm add @ensemble-sheets/server

# Adapters (pick what you need)
pnpm add @ensemble-sheets/identity-jwks      # JWKS-backed IdentityAdapter
pnpm add @ensemble-sheets/storage-fs         # local filesystem StorageAdapter
pnpm add @ensemble-sheets/storage-s3         # S3-compatible StorageAdapter
pnpm add @ensemble-sheets/webhook            # webhook EventAdapter
pnpm add @ensemble-sheets/scim-adapter       # SCIM provisioning
pnpm add @ensemble-sheets/ocr-tesseract      # local OCR via Tesseract.js
pnpm add @ensemble-sheets/crdt               # opt-in CRDT contract
pnpm add @ensemble-sheets/mcp-server         # MCP server for LLM agents
```

Peer requirements:

- `@ensemble-sheets/react` → `react ^18 || ^19`
- `@ensemble-sheets/vue` → `vue ^3.3.0`
- `@ensemble-sheets/server` → Node `>= 20.17`, Postgres 16+; **collab mode also
  needs Redis 7+**

## Single-user mode (simplest path)

When you only need editor + REST persistence — no multi-user cursors / locks /
live broadcast. **No Redis required.**

### Client

```ts
import { mountWorkbookEditor } from '@ensemble-sheets/core'

const handle = await mountWorkbookEditor({
  container: document.getElementById('editor')!,
  workbookId: 'wb-123',
  apiBaseUrl: 'https://your-server',
  wsBaseUrl: 'wss://your-server', // unused but type-required
  token: () => 'your-jwt',
  collab: false, // ← key flag
})

// Persist via REST
await handle.save() // POST /api/v1/workbooks/:id/snapshots

// Export
const bytes = handle.exportXlsx()

// Cleanup
await handle.destroy()
```

### Server

```ts
import { createServer, NoopEventAdapter } from '@ensemble-sheets/server'

createServer({
  databaseUrl: process.env.DATABASE_URL!,
  identity: yourIdentityAdapter,
  permission: yourPermissionAdapter,
  storage: yourStorageAdapter,
  event: new NoopEventAdapter(),
  collab: false, // ← skips Redis, WS bridge, cell-locks, presence, broadcaster
}).listen({ port: 3000 })
```

That's it. Single-user mode skips every realtime subsystem; Postgres is the
only infra dependency.

## Multi-user collab mode (default)

When you want shared cursors, cell-level locking, and live mutation broadcast.

### Client

```ts
import { mountWorkbookEditor } from '@ensemble-sheets/core'

const handle = await mountWorkbookEditor({
  container: document.getElementById('editor')!,
  workbookId: 'wb-123',
  apiBaseUrl: 'https://your-server',
  wsBaseUrl: 'wss://your-server',
  token: () => 'your-jwt',
  // collab defaults to true — no need to set
})

// Subscribe to realtime events
const unsubMut = handle.onMutationApplied((seq, userId) => {
  console.log(`remote edit #${seq} by ${userId}`)
})
const unsubPres = handle.onPresence((entries) => {
  console.log('users in room:', entries)
})
const unsubConn = handle.onConnectionChange((state) => {
  console.log('WS state:', state) // connecting / connected / reconnecting / offline
})

// `save()` and `exportXlsx()` still work the same way
```

### Server

```ts
import { createServer, NoopEventAdapter } from '@ensemble-sheets/server'

createServer({
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!, // ← required in collab mode
  identity: yourIdentityAdapter,
  permission: yourPermissionAdapter,
  storage: yourStorageAdapter,
  event: new NoopEventAdapter(),
  // collab defaults to true
}).listen({ port: 3000 })
```

The server then runs: cell-region locks (Redis `SET NX EX`), per-recipient
mask broadcast, presence tracking with 15s idle eviction, in-memory session
registry (admin-kick endpoints), and the @mention notification bus.

## Framework wrappers

### React

```tsx
import { WorkbookEditor } from '@ensemble-sheets/react'

export function MyPage() {
  return (
    <WorkbookEditor
      workbookId="wb-123"
      apiBaseUrl="https://your-server"
      wsBaseUrl="wss://your-server"
      token={async () => getJwt()}
      collab={false}
      onSaved={(snapshotId) => console.log('saved:', snapshotId)}
    />
  )
}
```

Also exported:
- `<FolderTree>` — workbook navigator with create / rename / drag-reorder
- `<VersionHistoryPanel>` — view + restore snapshots
- `<ChartPanel>` / `<PivotPanel>` — chart and pivot builders

### Vue

```vue
<script setup lang="ts">
import { WorkbookEditor } from '@ensemble-sheets/vue'

const props = defineProps<{ workbookId: string; token: string }>()
</script>

<template>
  <WorkbookEditor
    :workbook-id="props.workbookId"
    api-base-url="https://your-server"
    ws-base-url="wss://your-server"
    :token="() => props.token"
    @ready="(h) => console.log('mounted', h)"
  />
</template>
```

Also exported: `<FolderNavigator>`, `<VersionHistoryPanel>`, `<CellLockOverlay>`,
`<LockBadge>`.

## Required adapters (server)

`createServer` takes four required adapter parameters — these are the
extension points that let the SDK plug into your host's auth / storage / event
infrastructure. Contracts in `packages/server/src/adapters/`.

```ts
// IdentityAdapter — resolve a bearer token to { tenantId, userId }
const yourIdentityAdapter = {
  async resolveFromToken(token: string) {
    const claims = await verifyJwt(token)
    return { tenantId: claims.tid, userId: claims.sub }
  },
}

// PermissionAdapter — answer "can this user do X on this resource?"
const yourPermissionAdapter = {
  async getCapabilities(identity, resource) {
    return { canView: true, canEdit: true, canShare: false, canDelete: false }
  },
  async getMaskRules(identity, resource) {
    return [] // or rules to redact specific cells / columns
  },
}

// StorageAdapter — where snapshot blobs live (S3, GCS, fs, …)
const yourStorageAdapter = {
  async put(key, bytes) { /* ... */ },
  async get(key) { /* return Uint8Array */ },
  async delete(key) { /* ... */ },
}

// EventAdapter — fire host-side events (audit log, webhook fan-out, …)
const yourEventAdapter = {
  async emit(event) { /* ... */ },
}
```

Or use the bundled implementations:

```ts
import { createJwksIdentityAdapter } from '@ensemble-sheets/identity-jwks'
import { createFsStorageAdapter } from '@ensemble-sheets/storage-fs'
import { createS3StorageAdapter } from '@ensemble-sheets/storage-s3'
import { createWebhookEventAdapter } from '@ensemble-sheets/webhook'
```

## Database

Postgres 16+ with row-level security enforcing tenant isolation. Schema is
managed by drizzle. First-time setup:

```bash
DATABASE_URL=postgres://user:pass@host/dbname \
  npx @ensemble-sheets/server migrate
```

This creates the `app_user` role (RLS-bound) and runs every migration in
`packages/server/drizzle/`. After this, normal runtime connects as the
non-superuser `app_user`, with `SET LOCAL app.tenant_id` per transaction
enforcing tenancy.

## End-to-end example

Repo has a complete working example under `apps/demo`:

- `apps/demo/src/server-bootstrap.ts` — Hono server wired with all adapters
- `apps/demo/src/main.tsx` — React frontend mounting `<WorkbookEditor>`
- `apps/demo/docker-compose.dev.yml` — Postgres + Redis for local dev

```bash
git clone https://github.com/kdldbq/ensemble.git
cd ensemble
make setup       # install + docker up + migrate
make dev         # server on :5301, web on :5302
```

## Common gotchas

- **Client and server `collab` must match.** Pair `collab: false` on both, or
  leave both default. A client connecting with `collab: true` to a server with
  `collab: false` will silently fail to open WS (server returns 404 on
  `/api/v1/ws/:workbookId`).
- **Token function is called many times.** Both client and adapters call
  `token()` on each request; make sure it returns the current token (refresh
  if needed) rather than a stale one captured at mount time.
- **Don't mix locks and CRDT on the same workbook.** Cell-region locks
  (default) and CRDT (via `@ensemble-sheets/crdt`) are mutually exclusive —
  pick one per workbook. ADR-0002 explains the trade-off.
- **Vue ≥ 3.3** required. The wrapper uses `defineProps` with type literals
  which stabilized in 3.3 — Vue 3.2 users need to upgrade.
- **`@ensemble-sheets/mcp-server`** is an MCP server for LLM agents to read /
  write workbooks via tool calls — separate use case from frontend embedding;
  most integrations don't need it.

## References

- Repository: https://github.com/kdldbq/ensemble
- npm scope: https://www.npmjs.com/~fullrank
- Issues: https://github.com/kdldbq/ensemble/issues
- Design spec: `docs/specs/2026-05-15-ensemble-design.md`
- Architecture decisions: `docs/decisions/`
- Accessibility status: `docs/A11Y.md`
- Competitive comparison: `docs/research/2026-05-17-tencent-docs-vs-ensemble.md`

## Versioning

`0.x` minor bumps may include breaking changes per semver. Pin the version
range you ship against:

```json
{
  "dependencies": {
    "@ensemble-sheets/core": "0.2.0",
    "@ensemble-sheets/react": "0.2.0"
  }
}
```

All `@ensemble-sheets/*` packages version together (configured via changesets
`linked` in `.changeset/config.json`), so they stay in lockstep.
