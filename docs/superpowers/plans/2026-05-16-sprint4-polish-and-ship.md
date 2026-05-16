# Sprint 4 — "Polish + ship" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take ensemble from "internal Sprint 3 done" to "v0.1.0 GA — public OSS release." Wire deferred Sprint 3 polish (real LockBadge integration, demo Redis hardening, real-WS Playwright), close the spec §9 Sprint 4 deliverables (named version history, server-side xlsx export, EventAdapter triggering, conformance suite, docs site, EduCube dogfood), and ship v0.1.0.

**Architecture:**
- **Audit / events**: server emits `EnsembleEvent.publish` + writes `audit_log` row on workbook create/open/edit/folder create/share grant.
- **Version history**: 3 REST endpoints (list named / create / restore). Restore creates a new `reason='manual'` snapshot pointing at the named version's `storage_key`.
- **Server-side xlsx export**: Node SheetJS converts latest snapshot Univer JSON → xlsx bytes (mask-applied).
- **MaskRuleCache pub/sub**: Redis channel `ensemble:mask-invalidate` broadcasts invalidations across instances.
- **Conformance suite**: `@ensemble/adapter-conformance` test factories for the 4 adapter contracts.
- **Docs site**: Astro Starlight under `apps/docs/`.
- **EduCube dogfood**: `examples/integrate-fastapi/` Python + FastAPI 3 webhook endpoints + Vue UI.
- **Release**: NOTICE, CHANGELOG, GitHub release workflow via Changesets. Public push/publish gated on spec §11 decisions.

**Tech Stack:** Existing + Astro Starlight (docs) + Python 3.11 + FastAPI 0.115 (EduCube example).

**Spec reference:** `docs/specs/2026-05-15-ensemble-design.md` (§5/§6/§9/§10/§13).

**Pre-condition:** Sprint 3 complete on `main` at commit `5a4008a` or later. **Spec §11 decisions deferred but listed as Task 25 gates** (product name, GitHub org, domain).

---

## Conventions

- Working dir: `/Users/cedric/Projects.localized/ensemble`
- Coverage ≥90 lines, ≥80 branches; new code lands with tests
- TDD: red → green → commit
- Public release gated on §11 decisions — plan does not auto-push or publish

---

## Milestones

| Milestone | Tasks | Green-at-end |
|---|---|---|
| **M1: Audit + EventAdapter + mask invalidation** | T1-T4 | 5 EnsembleEvent types fired + audit_log rows; mask cache pub/sub |
| **M2: Sprint 3 polish carry-over** | T5-T8 | demo dedicated Redis container; CellLockOverlay React+Vue; real-WS Playwright |
| **M3: Version history** | T9-T13 | 3 endpoints + React+Vue VersionHistoryPanel |
| **M4: xlsx export + conformance** | T14-T17 | GET .xlsx; @ensemble/adapter-conformance |
| **M5: Docs site** | T18-T21 | Astro Starlight quickstart + API ref + integration guides |
| **M6: Ship** | T22-T26 | NOTICE + CHANGELOG + EduCube example + release workflow + decision gates |

---

## File structure delta

```
packages/server/
  drizzle/
    NNNN_audit_log.sql                          NEW (drizzle-kit)
    NNNN_rls_audit_log.sql                      NEW (handwritten)
  src/
    db/schema.ts                                MODIFY: audit_log table
    events/event-emitter.ts                     NEW
    http/routes/versions.ts                     NEW
    http/routes/export-xlsx.ts                  NEW
    realtime/mask-cache-pubsub.ts               NEW
    services/version-service.ts                 NEW
    services/xlsx-export-service.ts             NEW

packages/adapter-conformance/                   NEW PACKAGE
  src/identity.ts + permission.ts + storage.ts + event.ts + index.ts
  test/self-conformance.test.ts

packages/core/
  src/api-client.ts                             MODIFY: listVersions/createVersion/restoreVersion
  src/ws-client.ts                              MODIFY: onLockEvent
  src/types.ts                                  MODIFY: Version type

packages/react/
  src/VersionHistoryPanel.tsx                   NEW
  src/CellLockOverlay.tsx                       NEW

packages/vue/
  src/VersionHistoryPanel.vue                   NEW
  src/CellLockOverlay.vue                       NEW

apps/demo/
  docker-compose.dev.yml                        NEW: dedicated PG+Redis (54320/63790)
  e2e/global-setup.ts                           NEW: brings up containers + migrate
  e2e/global-teardown.ts                        NEW
  e2e/playwright.config.ts                      MODIFY
  e2e/open-edit-save-reload.spec.ts             MODIFY: remove fixme
  e2e/two-clients-collab.spec.ts                MODIFY: remove fixme
  e2e/multi-browser-locks.spec.ts               NEW

apps/docs/                                      NEW: Astro Starlight site

examples/integrate-fastapi/                     NEW: Python FastAPI + Vue UI

NOTICE                                          NEW
CHANGELOG.md                                    NEW
scripts/add-headers.mjs                         NEW: optional Apache-2.0 header injector
.github/workflows/release.yml                   NEW: tag → npm publish
.changeset/initial-v0.1.0.md                    NEW: first release changeset
```

---

# Milestone 1 — Audit + EventAdapter + mask invalidation

## Task 1: `audit_log` table

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Generate: `packages/server/drizzle/NNNN_audit_log.sql`
- Create: `packages/server/drizzle/NNNN_rls_audit_log.sql`

- [ ] **Step 1.1: Schema**

Append to `packages/server/src/db/schema.ts`:

```ts
export const auditEventType = pgEnum('audit_event_type', [
  'workbook.created', 'workbook.opened', 'workbook.edited',
  'folder.created', 'share.granted',
])

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    eventType: auditEventType('event_type').notNull(),
    actorId: text('actor_id').notNull(),
    resourceId: uuid('resource_id'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantOccurredIdx: index('audit_log_tenant_occurred_idx').on(t.tenantId, t.occurredAt),
  })
)
```

- [ ] **Step 1.2: Generate + RLS**

```bash
pnpm --filter @ensemble/server exec drizzle-kit generate --name audit_log
```

Create `packages/server/drizzle/0008_rls_audit_log.sql`:

```sql
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_log_tenant_isolation ON audit_log
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
GRANT SELECT, INSERT ON audit_log TO app_user;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO app_user;
```

Append _journal entry.

- [ ] **Step 1.3: Commit**

```bash
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/server test test/integration/migration.int.test.ts
git add packages/server
git commit -m "feat(server): audit_log table + RLS"
```

---

## Task 2: EventEmitter + route triggering

**Files:**
- Create: `packages/server/src/events/event-emitter.ts`
- Create: `packages/server/test/unit/event-emitter.test.ts`
- Modify: `packages/server/src/http/routes/{workbooks,snapshots,folders,grants}.ts`
- Modify: `packages/server/src/http/app.ts` (wire EventEmitter)
- Create: `packages/server/test/integration/audit-log.int.test.ts`

- [ ] **Step 2.1: Failing unit test**

Create `packages/server/test/unit/event-emitter.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createEventEmitter } from '../../src/events/event-emitter'

describe('EventEmitter', () => {
  it('writes audit row and calls adapter.publish in parallel', async () => {
    const inserts: unknown[] = []
    const fakeDb = { insert: () => ({ values: async (v: unknown) => { inserts.push(v) } }) }
    const publish = vi.fn(async () => {})
    const emitter = createEventEmitter({ db: fakeDb as never, eventAdapter: { publish } })

    await emitter.emit({ tenantId: 'tA', actorId: 'u1', type: 'workbook.created', resourceId: 'wb1' })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(inserts).toHaveLength(1)
  })

  it('swallows adapter errors but still writes audit', async () => {
    const inserts: unknown[] = []
    const fakeDb = { insert: () => ({ values: async (v: unknown) => { inserts.push(v) } }) }
    const adapter = { publish: vi.fn(async () => { throw new Error('webhook down') }) }
    const emitter = createEventEmitter({ db: fakeDb as never, eventAdapter: adapter })
    await expect(emitter.emit({
      tenantId: 't', actorId: 'u', type: 'workbook.edited', resourceId: 'wb',
      extra: { batchedOpsCount: 5 },
    })).resolves.toBeUndefined()
    expect(inserts).toHaveLength(1)
  })
})
```

- [ ] **Step 2.2: Implement EventEmitter**

Create `packages/server/src/events/event-emitter.ts`:

```ts
import type { Database } from '../db/client'
import { auditLog } from '../db/schema'
import type { EventAdapter, EnsembleEvent } from '../adapters/identity'

export interface EmitInput {
  tenantId: string
  actorId: string
  type: EnsembleEvent['type']
  resourceId?: string
  extra?: Record<string, unknown>
}

export interface EventEmitterDeps {
  db: Database
  eventAdapter: EventAdapter
}

function buildEvent(input: EmitInput, at: string): EnsembleEvent {
  switch (input.type) {
    case 'workbook.created':
      return { type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at }
    case 'workbook.opened':
      return { type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at }
    case 'workbook.edited':
      return {
        type: input.type, workbookId: input.resourceId ?? '', userId: input.actorId, at,
        batchedOpsCount: (input.extra?.batchedOpsCount as number) ?? 0,
      }
    case 'folder.created':
      return { type: input.type, folderId: input.resourceId ?? '', userId: input.actorId, at }
    case 'share.granted':
      return { type: input.type, grantId: input.resourceId ?? '', grantedBy: input.actorId, at }
  }
}

export function createEventEmitter(deps: EventEmitterDeps) {
  return {
    async emit(input: EmitInput): Promise<void> {
      const at = new Date().toISOString()
      const ev = buildEvent(input, at)
      await Promise.all([
        deps.db.insert(auditLog).values({
          tenantId: input.tenantId,
          eventType: input.type,
          actorId: input.actorId,
          resourceId: input.resourceId ?? null,
          payload: input.extra ?? {},
        }),
        deps.eventAdapter.publish(ev).catch((err) => {
          console.warn(`EventAdapter.publish failed for ${input.type}:`, err)
        }),
      ])
    },
  }
}

export type EventEmitter = ReturnType<typeof createEventEmitter>
```

- [ ] **Step 2.3: Wire into buildApp**

Edit `packages/server/src/http/app.ts`:
- Import `createEventEmitter, type EventEmitter`
- `AppServices` adds `events: EventEmitter`
- Construct `events: createEventEmitter({ db, eventAdapter: deps.event })` inside `buildApp`

- [ ] **Step 2.4: Trigger emit from routes**

`workbooks.ts`:
- After successful POST: `await c.get('services').events.emit({ tenantId: id.tenantId, actorId: id.userId, type: 'workbook.created', resourceId: wb.id })`
- After successful GET `:id`: emit `workbook.opened`

`snapshots.ts`:
- After successful POST snapshot: emit `workbook.edited` with `extra: { batchedOpsCount: 0 }`

`folders.ts`:
- After successful POST: emit `folder.created` with `resourceId: created.id`

`grants.ts`:
- After successful POST: emit `share.granted` with `resourceId: row.id`

- [ ] **Step 2.5: Integration test**

Create `packages/server/test/integration/audit-log.int.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { db } from './_dbHelpers'
import { tenants } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('audit_log', () => {
  it('POST /workbooks writes workbook.created audit row + fires EventAdapter', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'audit-t' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const publish = vi.fn(async () => {})
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: { publish },
    })
    await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'audited' }),
    })
    const rows = await db.execute(sql`SELECT event_type FROM audit_log WHERE tenant_id = ${tenant.id}`)
    expect(rows.map((r) => r.event_type)).toContain('workbook.created')
    expect(publish).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2.6: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/event-emitter.test.ts test/integration/audit-log.int.test.ts
git add packages/server
git commit -m "feat(server): EventEmitter writes audit_log + fires EventAdapter for all five events"
```

---

## Task 3: MaskRuleCache pub/sub invalidation

**Files:**
- Create: `packages/server/src/realtime/mask-cache-pubsub.ts`
- Create: `packages/server/test/unit/mask-cache-pubsub.test.ts`
- Modify: `packages/server/src/services/mask-service.ts` (publish on invalidate + expose `_dropLocal`)
- Modify: `packages/server/src/http/app.ts` (wire pubsub)

- [ ] **Step 3.1: Failing test**

Create `packages/server/test/unit/mask-cache-pubsub.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createMaskCachePubSub, INVALIDATE_CHANNEL } from '../../src/realtime/mask-cache-pubsub'

function fakeRedis() {
  const handlers = new Map<string, ((channel: string, msg: string) => void)[]>()
  const self = {
    publish: vi.fn(async (ch: string, msg: string) => {
      const hs = handlers.get(ch) ?? []
      for (const h of hs) h(ch, msg)
      return hs.length
    }),
    subscribe: vi.fn(async (..._channels: string[]) => undefined),
    on: vi.fn((event: string, cb: (ch: string, msg: string) => void) => {
      if (event === 'message') {
        const list = handlers.get(INVALIDATE_CHANNEL) ?? []
        list.push(cb)
        handlers.set(INVALIDATE_CHANNEL, list)
      }
    }),
    unsubscribe: vi.fn(async () => undefined),
    quit: vi.fn(async () => undefined),
    duplicate(): typeof self { return self },
  }
  return self
}

describe('MaskCachePubSub', () => {
  it('publish + subscribe broadcasts invalidate', async () => {
    const redis = fakeRedis()
    const onInvalidate = vi.fn()
    const pubsub = createMaskCachePubSub({ redis: redis as never, onInvalidate })
    await pubsub.start()
    await pubsub.invalidate('u1', 'wb1')
    expect(onInvalidate).toHaveBeenCalledWith('u1', 'wb1')
  })
})
```

- [ ] **Step 3.2: Implement**

Create `packages/server/src/realtime/mask-cache-pubsub.ts`:

```ts
import type { Redis } from '../redis/client'

export const INVALIDATE_CHANNEL = 'ensemble:mask-invalidate'

export interface MaskCachePubSubOpts {
  redis: Redis
  onInvalidate: (userId: string, workbookId: string) => void
}

export function createMaskCachePubSub(opts: MaskCachePubSubOpts) {
  const sub = opts.redis.duplicate()
  let started = false
  return {
    async start(): Promise<void> {
      if (started) return
      await sub.subscribe(INVALIDATE_CHANNEL)
      sub.on('message', (channel: string, msg: string) => {
        if (channel !== INVALIDATE_CHANNEL) return
        try {
          const { userId, workbookId } = JSON.parse(msg) as { userId: string; workbookId: string }
          opts.onInvalidate(userId, workbookId)
        } catch { /* malformed */ }
      })
      started = true
    },
    async invalidate(userId: string, workbookId: string): Promise<void> {
      await opts.redis.publish(INVALIDATE_CHANNEL, JSON.stringify({ userId, workbookId }))
    },
    async stop(): Promise<void> {
      if (!started) return
      await sub.unsubscribe(INVALIDATE_CHANNEL)
      await sub.quit()
      started = false
    },
  }
}

export type MaskCachePubSub = ReturnType<typeof createMaskCachePubSub>
```

- [ ] **Step 3.3: Wire to MaskRuleCache + buildApp**

Edit `packages/server/src/services/mask-service.ts`:
- `MaskRuleCache` ctor accepts optional `pubsub?: MaskCachePubSub`
- `invalidate(userId, workbookId)` also calls `pubsub?.invalidate(userId, workbookId)`
- Add `_dropLocal(userId, workbookId): void` that only deletes from the local map (no pubsub roundtrip)

Edit `packages/server/src/http/app.ts`:
- Construct `maskPubSub = createMaskCachePubSub({ redis, onInvalidate: (u, wb) => services.masks._dropLocal(u, wb) })`
- `void maskPubSub.start()` at boot
- Pass `pubsub: maskPubSub` to `MaskRuleCache` ctor

- [ ] **Step 3.4: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/mask-cache-pubsub.test.ts
git add packages/server
git commit -m "feat(server): MaskRuleCache cross-instance invalidate via Redis pub/sub"
```

---

## Task 4: M1 checkpoint (no code)

- [ ] Run `pnpm -r test --coverage` — all packages still pass thresholds
- [ ] Run `pnpm -r build` — clean

> **🟢 M1 checkpoint**

---

# Milestone 2 — Sprint 3 polish carry-over

## Task 5: Demo dedicated Postgres+Redis containers

**Files:**
- Create: `apps/demo/docker-compose.dev.yml`
- Modify: `apps/demo/package.json` (db:up/db:down scripts)
- Modify: `apps/demo/e2e/playwright.config.ts`
- Create: `apps/demo/e2e/global-setup.ts`
- Create: `apps/demo/e2e/global-teardown.ts`
- Modify: `apps/demo/e2e/open-edit-save-reload.spec.ts` (remove fixme)
- Modify: `apps/demo/e2e/two-clients-collab.spec.ts` (remove fixme)

- [ ] **Step 5.1: docker-compose**

Create `apps/demo/docker-compose.dev.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ensemble_dev
    ports: ["54320:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["63790:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      retries: 10
```

- [ ] **Step 5.2: package.json scripts**

Edit `apps/demo/package.json`:

```json
"scripts": {
  "db:up": "docker compose -f docker-compose.dev.yml up -d",
  "db:down": "docker compose -f docker-compose.dev.yml down",
  "dev:server": "DATABASE_URL=postgres://postgres:postgres@localhost:54320/ensemble_dev REDIS_URL=redis://localhost:63790 tsx src/server-runner.ts",
  ...
}
```

- [ ] **Step 5.3: Playwright global setup/teardown**

Create `apps/demo/e2e/global-setup.ts`:

```ts
import { execSync } from 'node:child_process'

export default async function globalSetup(): Promise<void> {
  const cwd = __dirname.replace('/e2e', '')
  execSync('docker compose -f docker-compose.dev.yml up -d --wait', { cwd, stdio: 'inherit' })
  execSync(
    'DATABASE_URL=postgres://postgres:postgres@localhost:54320/ensemble_dev pnpm --filter @ensemble/server exec node dist/db/migrate.js',
    { stdio: 'inherit' }
  )
}
```

Create `apps/demo/e2e/global-teardown.ts`:

```ts
import { execSync } from 'node:child_process'

export default async function globalTeardown(): Promise<void> {
  if (process.env.CI) {
    const cwd = __dirname.replace('/e2e', '')
    execSync('docker compose -f docker-compose.dev.yml down', { cwd, stdio: 'inherit' })
  }
}
```

Edit `apps/demo/e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: [
    {
      command: 'pnpm dev:server',
      port: 3000, timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: {
        DATABASE_URL: 'postgres://postgres:postgres@localhost:54320/ensemble_dev',
        REDIS_URL: 'redis://localhost:63790',
      },
    },
    { command: 'pnpm dev:web', port: 5173, timeout: 60_000, reuseExistingServer: !process.env.CI },
  ],
  testDir: '.',
})
```

- [ ] **Step 5.4: Remove fixmes**

Edit `apps/demo/e2e/open-edit-save-reload.spec.ts` — change `test.fixme(` → `test(`.
Edit `apps/demo/e2e/two-clients-collab.spec.ts` — same.

- [ ] **Step 5.5: Run + commit**

```bash
pnpm --filter @ensemble/demo e2e
```

Expected: 3/4 pass (Sprint 1 Univer-keyboard fixme remains).

```bash
git add apps/demo
git commit -m "fix(demo): dedicated Postgres + Redis containers; un-fixme save-reload + collab"
```

---

## Task 6: React `<CellLockOverlay />` + WsClient.onLockEvent

**Files:**
- Modify: `packages/core/src/ws-client.ts`
- Modify: `packages/core/test/ws-client.test.ts`
- Create: `packages/react/src/CellLockOverlay.tsx`
- Create: `packages/react/test/CellLockOverlay.test.tsx`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 6.1: Failing test (React)**

Create `packages/react/test/CellLockOverlay.test.tsx`:

```tsx
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CellLockOverlay } from '../src/CellLockOverlay'

function makeWsClient() {
  const listeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []
  return {
    onLockEvent: vi.fn((cb: (f: { type: string } & Record<string, unknown>) => void) => {
      listeners.push(cb)
      return () => { /* unsubscribe */ }
    }),
    _emit(f: { type: string } & Record<string, unknown>): void {
      for (const cb of listeners) cb(f)
    },
  }
}

describe('<CellLockOverlay />', () => {
  it('renders nothing when no locks', () => {
    const ws = makeWsClient()
    const { container } = render(<CellLockOverlay wsClient={ws as never} />)
    expect(container.querySelectorAll('.ensemble-lock-badge')).toHaveLength(0)
  })

  it('shows badge on lock_acquired', async () => {
    const ws = makeWsClient()
    const { findByText } = render(<CellLockOverlay wsClient={ws as never} />)
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await findByText('u-42 editing')
  })

  it('removes badge on lock_released', async () => {
    const ws = makeWsClient()
    const { findByText, queryByText } = render(<CellLockOverlay wsClient={ws as never} />)
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await findByText('u-42 editing')
    ws._emit({ type: 'lock_released', region: 'A1:A1' })
    await waitFor(() => expect(queryByText('u-42 editing')).toBeNull())
  })
})
```

- [ ] **Step 6.2: WsClient.onLockEvent**

Edit `packages/core/src/ws-client.ts`:
- Add `lockListeners: Array<(f: ...) => void> = []`
- Add `onLockEvent(cb): () => void`
- Inside `attachDemuxer`, route `lock_acquired` / `lock_released` to `lockListeners`

Append to `packages/core/test/ws-client.test.ts`:

```ts
it('onLockEvent receives lock_acquired and lock_released', async () => {
  const { sockets, Ctor } = stubSocketFactory()
  const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
  const p = client.connect()
  sockets[0].fire('open', '')
  sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w', seqNum: 0, snapshot: null }))
  await p
  const events: Array<{ type: string }> = []
  client.onLockEvent((f) => events.push(f))
  sockets[0].fire('message', JSON.stringify({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'me', ttlSec: 30 }))
  sockets[0].fire('message', JSON.stringify({ type: 'lock_released', region: 'A1:A1' }))
  expect(events.map((e) => e.type)).toEqual(['lock_acquired', 'lock_released'])
})
```

- [ ] **Step 6.3: Implement CellLockOverlay**

Create `packages/react/src/CellLockOverlay.tsx`:

```tsx
import type { WsClient } from '@ensemble/core'
import { useEffect, useState } from 'react'
import { LockBadge } from './LockBadge'

export interface CellLockOverlayProps {
  wsClient: Pick<WsClient, 'onLockEvent'>
  className?: string
}

export function CellLockOverlay({ wsClient, className }: CellLockOverlayProps) {
  const [locks, setLocks] = useState<Record<string, string>>({})

  useEffect(() => {
    return wsClient.onLockEvent((frame) => {
      if (frame.type === 'lock_acquired') {
        setLocks((prev) => ({ ...prev, [frame.region]: frame.ownerId }))
      } else if (frame.type === 'lock_released') {
        setLocks((prev) => {
          const next = { ...prev }
          delete next[frame.region]
          return next
        })
      }
    })
  }, [wsClient])

  return (
    <div className={`ensemble-cell-lock-overlay ${className ?? ''}`} aria-live="polite">
      {Object.entries(locks).map(([region, ownerId]) => (
        <div key={region} data-region={region} style={{ display: 'inline-block', marginRight: 8 }}>
          <span style={{ marginRight: 4, fontFamily: 'monospace' }}>{region}</span>
          <LockBadge ownerId={ownerId} />
        </div>
      ))}
    </div>
  )
}
```

Edit `packages/react/src/index.ts` to export.

- [ ] **Step 6.4: Run + commit**

```bash
pnpm --filter @ensemble/core test
pnpm --filter @ensemble/react test
git add packages/core packages/react
git commit -m "feat(react+core): CellLockOverlay + WsClient.onLockEvent"
```

---

## Task 7: Vue `<CellLockOverlay />`

**Files:**
- Create: `packages/vue/src/CellLockOverlay.vue`
- Create: `packages/vue/test/CellLockOverlay.test.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 7.1: Failing test**

Create `packages/vue/test/CellLockOverlay.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CellLockOverlay from '../src/CellLockOverlay.vue'

function makeWsClient() {
  const listeners: Array<(f: { type: string } & Record<string, unknown>) => void> = []
  return {
    onLockEvent: vi.fn((cb: (f: { type: string } & Record<string, unknown>) => void) => {
      listeners.push(cb)
      return () => {}
    }),
    _emit(f: { type: string } & Record<string, unknown>): void {
      for (const cb of listeners) cb(f)
    },
  }
}

describe('<CellLockOverlay /> Vue', () => {
  it('shows badge on lock_acquired', async () => {
    const ws = makeWsClient()
    const wrapper = mount(CellLockOverlay, { props: { wsClient: ws } })
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('u-42')
  })
  it('removes badge on lock_released', async () => {
    const ws = makeWsClient()
    const wrapper = mount(CellLockOverlay, { props: { wsClient: ws } })
    ws._emit({ type: 'lock_acquired', region: 'A1:A1', ownerId: 'u-42', ttlSec: 30 })
    await wrapper.vm.$nextTick()
    ws._emit({ type: 'lock_released', region: 'A1:A1' })
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('u-42')
  })
})
```

- [ ] **Step 7.2: Implement**

Create `packages/vue/src/CellLockOverlay.vue`:

```vue
<script setup lang="ts">
import type { WsClient } from '@ensemble/core'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import LockBadge from './LockBadge.vue'

const props = defineProps<{ wsClient: Pick<WsClient, 'onLockEvent'>; class?: string }>()
const locks = ref<Record<string, string>>({})
let unsub: (() => void) | null = null

onMounted(() => {
  unsub = props.wsClient.onLockEvent((frame) => {
    if (frame.type === 'lock_acquired') {
      locks.value = { ...locks.value, [frame.region]: frame.ownerId }
    } else if (frame.type === 'lock_released') {
      const next = { ...locks.value }
      delete next[frame.region]
      locks.value = next
    }
  })
})
onBeforeUnmount(() => { unsub?.() })
</script>

<template>
  <div :class="['ensemble-cell-lock-overlay', props.class]" aria-live="polite">
    <div v-for="(ownerId, region) in locks" :key="region" :data-region="region"
         style="display: inline-block; margin-right: 8px">
      <span style="margin-right: 4px; font-family: monospace">{{ region }}</span>
      <LockBadge :owner-id="ownerId" />
    </div>
  </div>
</template>
```

Edit `packages/vue/src/index.ts` to export.

- [ ] **Step 7.3: Run + commit**

```bash
pnpm --filter @ensemble/vue test
git add packages/vue
git commit -m "feat(vue): <CellLockOverlay /> SFC"
```

---

## Task 8: Real-WS multi-browser lock-race e2e

**Files:**
- Modify: `packages/core/src/mount.ts` (expose `_wsClient` on MountHandle)
- Modify: `apps/demo/src/main.tsx` (bind acquire helper to window)
- Create: `apps/demo/e2e/multi-browser-locks.spec.ts`

- [ ] **Step 8.1: Expose _wsClient on MountHandle**

Edit `packages/core/src/mount.ts`:
- `MountHandle` adds `_wsClient: WsClient` (underscored = internal)
- The returned object includes `_wsClient: ws`

Add a test in `packages/core/test/mount.test.ts`:

```ts
it('handle.exposes _wsClient', async () => {
  // setup like existing test, just assert handle._wsClient is truthy
})
```

- [ ] **Step 8.2: Demo binds helper**

Edit `apps/demo/src/main.tsx` `Pane.onReady`:

```ts
onReady={(h) => {
  ;(window as unknown as Record<string, unknown>)[`ensembleSave_${userId}`] = () => h.save()
  ;(window as unknown as Record<string, unknown>)[`ensembleAcquireLock_${userId}`] = (region: string) =>
    (h as unknown as { _wsClient: { acquireLock: (r: string) => Promise<unknown> } })._wsClient.acquireLock(region)
}}
```

- [ ] **Step 8.3: E2e spec**

Create `apps/demo/e2e/multi-browser-locks.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('two contexts: only one wins the same-cell lock', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await pageA.goto('/'); await pageA.evaluate(() => localStorage.clear())
  await pageB.goto('/'); await pageB.evaluate(() => localStorage.clear())

  await pageA.waitForFunction(() => !!localStorage.getItem('wbId-shared'), { timeout: 30_000 })
  const wbId = (await pageA.evaluate(() => localStorage.getItem('wbId-shared')))!
  await pageB.evaluate((id) => localStorage.setItem('wbId-shared', id), wbId)
  await pageB.reload()
  await expect(pageB.locator('.ensemble-workbook-root').first()).toBeVisible({ timeout: 30_000 })

  // Wait for helper to be bound
  await pageA.waitForFunction(() => typeof (window as { ensembleAcquireLock_admin?: unknown }).ensembleAcquireLock_admin === 'function')
  await pageB.waitForFunction(() => typeof (window as { ensembleAcquireLock_admin?: unknown }).ensembleAcquireLock_admin === 'function')

  const [a, b] = await Promise.all([
    pageA.evaluate(() =>
      (window as unknown as { ensembleAcquireLock_admin: (r: string) => Promise<{ acquired: boolean; ownerId: string }> })
        .ensembleAcquireLock_admin('A1:A1')
    ),
    pageB.evaluate(() =>
      (window as unknown as { ensembleAcquireLock_admin: (r: string) => Promise<{ acquired: boolean; ownerId: string }> })
        .ensembleAcquireLock_admin('A1:A1')
    ),
  ])
  expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1)
  await ctxA.close(); await ctxB.close()
})
```

- [ ] **Step 8.4: Run + commit**

```bash
pnpm --filter @ensemble/core test
pnpm --filter @ensemble/demo e2e
git add packages/core apps/demo
git commit -m "feat(demo): real-WS multi-browser lock-race e2e"
```

> **🟢 M2 checkpoint**

---

# Milestone 3 — Version history

## Task 9: VersionService

**Files:**
- Create: `packages/server/src/services/version-service.ts`
- Create: `packages/server/test/unit/version-service.test.ts`

- [ ] **Step 9.1: Failing unit test**

Create `packages/server/test/unit/version-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createVersionService } from '../../src/services/version-service'

function fakeDb() {
  const rows: Record<string, unknown>[] = []
  let n = 1
  return {
    _rows: rows,
    select() {
      return {
        from: () => ({
          where: () => ({
            orderBy: async () => rows.filter((r) => (r as { reason: string }).reason === 'named'),
            limit: async () => rows.slice(0, 1),
          }),
        }),
      }
    },
    insert() {
      return {
        values: (v: Record<string, unknown>) => ({
          returning: async () => {
            const row = { id: 'snap_' + n++, ...v }
            rows.push(row)
            return [row]
          },
        }),
      }
    },
    update() {
      return { set: () => ({ where: async () => undefined }) }
    },
  }
}

describe('VersionService.listNamed', () => {
  it('returns only reason=named', async () => {
    const db = fakeDb()
    db._rows.push(
      { id: 'a', reason: 'auto', name: null, workbookId: 'wb', createdBy: 'u', createdAt: new Date() },
      { id: 'b', reason: 'named', name: 'V1', workbookId: 'wb', createdBy: 'u', createdAt: new Date() },
    )
    const svc = createVersionService(db as never, {} as never)
    const list = await svc.listNamed('wb')
    expect(list.map((s) => s.id)).toEqual(['b'])
  })
})
```

- [ ] **Step 9.2: Implement**

Create `packages/server/src/services/version-service.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { snapshots, workbooks } from '../db/schema'
import type { SnapshotService } from './snapshot-service'

export interface ListNamedRow {
  id: string
  workbookId: string
  name: string
  createdBy: string
  createdAt: Date
}

export function createVersionService(db: Database, snapSvc: SnapshotService) {
  return {
    async listNamed(workbookId: string): Promise<ListNamedRow[]> {
      const rows = await db
        .select({
          id: snapshots.id, workbookId: snapshots.workbookId,
          name: snapshots.name, createdBy: snapshots.createdBy, createdAt: snapshots.createdAt,
        })
        .from(snapshots)
        .where(and(eq(snapshots.workbookId, workbookId), eq(snapshots.reason, 'named')))
        .orderBy(desc(snapshots.createdAt))
      return rows
        .filter((r) => r.name !== null)
        .map((r) => ({
          id: r.id, workbookId: r.workbookId,
          name: r.name as string, createdBy: r.createdBy, createdAt: r.createdAt,
        }))
    },

    async createNamed(input: { workbookId: string; userId: string; name: string }) {
      const latest = await snapSvc.getLatest(input.workbookId)
      if (!latest) throw new Error('cannot create version: no snapshots exist')
      const [row] = await db.insert(snapshots).values({
        workbookId: input.workbookId,
        storageKey: latest.storageKey,
        sizeBytes: latest.sizeBytes,
        createdBy: input.userId,
        reason: 'named',
        name: input.name,
      }).returning()
      return row
    },

    async restore(input: { workbookId: string; versionId: string; userId: string }) {
      const [version] = await db.select().from(snapshots).where(eq(snapshots.id, input.versionId)).limit(1)
      if (!version || version.workbookId !== input.workbookId || version.reason !== 'named') {
        throw new Error('version not found')
      }
      const [restored] = await db.insert(snapshots).values({
        workbookId: input.workbookId,
        storageKey: version.storageKey,
        sizeBytes: version.sizeBytes,
        createdBy: input.userId,
        reason: 'manual',
        name: null,
      }).returning()
      await db.update(workbooks)
        .set({ currentSnapshotId: restored.id, updatedAt: new Date() })
        .where(eq(workbooks.id, input.workbookId))
      return restored
    },
  }
}

export type VersionService = ReturnType<typeof createVersionService>
```

- [ ] **Step 9.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/version-service.test.ts
git add packages/server
git commit -m "feat(server): VersionService (listNamed / createNamed / restore)"
```

---

## Task 10: Versions REST + integration test

**Files:**
- Create: `packages/server/src/http/routes/versions.ts`
- Modify: `packages/server/src/http/app.ts` (register + add services.versions)
- Create: `packages/server/test/integration/versions.int.test.ts`

- [ ] **Step 10.1: Failing test**

Create `packages/server/test/integration/versions.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function buildAllowAll(tenantId: string) {
  const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId, userId: 'u1' }) }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }
  const blobs = new Map<string, Uint8Array>()
  return buildApp({
    db, identity, permission,
    storage: {
      put: async (k, b) => { blobs.set(k, b) },
      get: async (k) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k) => { blobs.delete(k) },
    },
    event: new NoopEventAdapter(),
  })
}

describe('versions REST', () => {
  it('snapshot → named version → list → restore', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'versions-t' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' }).returning()
    const app = buildAllowAll(tenant.id)

    await app.request(`/api/v1/workbooks/${wb.id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode('{"sheets":{}}'),
    })

    const named = await app.request(`/api/v1/workbooks/${wb.id}/versions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'V1' }),
    })
    expect(named.status).toBe(201)
    const ns = (await named.json()) as { id: string; name: string }
    expect(ns.name).toBe('V1')

    const list = await app.request(`/api/v1/workbooks/${wb.id}/versions`, {
      headers: { Authorization: 'Bearer x' },
    })
    const { items } = (await list.json()) as { items: { id: string }[] }
    expect(items.some((s) => s.id === ns.id)).toBe(true)

    const restore = await app.request(`/api/v1/workbooks/${wb.id}/restore/${ns.id}`, {
      method: 'POST', headers: { Authorization: 'Bearer x' },
    })
    expect(restore.status).toBe(201)
  })
})
```

- [ ] **Step 10.2: Implement route**

Create `packages/server/src/http/routes/versions.ts`:

```ts
import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import type { AppEnv } from '../app'

export const versionsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:wbId/versions',
    requireCapability('canView', (c) => ({
      type: 'workbook', id: c.req.param('wbId'), tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => c.json({ items: await c.get('services').versions.listNamed(c.req.param('wbId')) })
  )
  .post(
    '/api/v1/workbooks/:wbId/versions',
    requireCapability('canEdit', (c) => ({
      type: 'workbook', id: c.req.param('wbId'), tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const idCtx = c.get('identity')!
      const body = (await c.req.json()) as { name?: string }
      if (!body.name) return c.json({ error: 'name required' }, 400)
      try {
        const row = await c.get('services').versions.createNamed({
          workbookId: c.req.param('wbId'), userId: idCtx.userId, name: body.name,
        })
        return c.json(row, 201)
      } catch (err) {
        if (err instanceof Error && /no snapshots/.test(err.message)) {
          return c.json({ error: 'cannot create version: workbook has no snapshots' }, 400)
        }
        throw err
      }
    }
  )
  .post(
    '/api/v1/workbooks/:wbId/restore/:versionId',
    requireCapability('canEdit', (c) => ({
      type: 'workbook', id: c.req.param('wbId'), tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const idCtx = c.get('identity')!
      try {
        const row = await c.get('services').versions.restore({
          workbookId: c.req.param('wbId'), versionId: c.req.param('versionId'), userId: idCtx.userId,
        })
        return c.json(row, 201)
      } catch (err) {
        if (err instanceof Error && /not found/.test(err.message)) {
          return c.json({ error: 'version not found' }, 404)
        }
        throw err
      }
    }
  )
```

Wire into `app.ts`: services.versions + `app.route('/', versionsRoute)`.

- [ ] **Step 10.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/versions.int.test.ts
git add packages/server
git commit -m "feat(server): /api/v1/workbooks/:id/versions endpoints (list+create+restore)"
```

---

## Task 11: Core ApiClient — version methods

**Files:**
- Modify: `packages/core/src/types.ts` (Version)
- Modify: `packages/core/src/api-client.ts`
- Modify: `packages/core/test/api-client.test.ts`

- [ ] **Step 11.1: Type**

Append to `packages/core/src/types.ts`:

```ts
export interface Version {
  id: string
  workbookId: string
  name: string
  createdBy: string
  createdAt: string
}
```

- [ ] **Step 11.2: Failing test**

Append to `packages/core/test/api-client.test.ts`:

```ts
describe('ApiClient versions', () => {
  it('listVersions / createVersion / restoreVersion', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST' && url.endsWith('/versions'))
        return new Response(JSON.stringify({ id: 'v1', name: 'V1' }), { status: 201 })
      if (init?.method === 'POST' && url.includes('/restore/'))
        return new Response(JSON.stringify({ id: 'r1' }), { status: 201 })
      return new Response(JSON.stringify({ items: [{ id: 'v1', name: 'V1' }] }), { status: 200 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    expect((await api.listVersions('wb1')).items).toEqual([{ id: 'v1', name: 'V1' }])
    const v = await api.createVersion('wb1', 'V1')
    expect(v.id).toBe('v1')
    const r = await api.restoreVersion('wb1', 'v1')
    expect(r.id).toBe('r1')
  })
})
```

- [ ] **Step 11.3: Implement**

Append to `packages/core/src/api-client.ts`:

```ts
  async listVersions(workbookId: string): Promise<{ items: Version[] }> {
    return (await this.req(`/api/v1/workbooks/${workbookId}/versions`)).json() as Promise<{ items: Version[] }>
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
    const res = await this.req(`/api/v1/workbooks/${workbookId}/restore/${versionId}`, { method: 'POST' })
    return res.json() as Promise<{ id: string }>
  }
```

Add `Version` to `import type` line.

- [ ] **Step 11.4: Run + commit**

```bash
pnpm --filter @ensemble/core test
git add packages/core
git commit -m "feat(core): ApiClient version methods"
```

---

## Task 12: React `<VersionHistoryPanel />`

**Files:**
- Create: `packages/react/src/VersionHistoryPanel.tsx`
- Create: `packages/react/test/VersionHistoryPanel.test.tsx`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 12.1: Failing test**

Create `packages/react/test/VersionHistoryPanel.test.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VersionHistoryPanel } from '../src/VersionHistoryPanel'
import type { Version } from '@ensemble/core'

function makeApi(initial: Version[]) {
  let items = initial
  return {
    listVersions: vi.fn(async () => ({ items })),
    createVersion: vi.fn(async (_wb: string, name: string): Promise<Version> => {
      const v: Version = { id: 'new-' + items.length, workbookId: 'wb', name, createdBy: 'u', createdAt: '' }
      items = [...items, v]
      return v
    }),
    restoreVersion: vi.fn(async () => ({ id: 'r1' })),
  }
}

describe('<VersionHistoryPanel />', () => {
  it('lists existing versions', async () => {
    const api = makeApi([{ id: 'v1', workbookId: 'wb', name: 'V1', createdBy: 'u', createdAt: '' }])
    const { findByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    await findByText('V1')
  })

  it('creates version on submit', async () => {
    const api = makeApi([])
    const { getByLabelText, findByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    fireEvent.click(getByLabelText('Save version'))
    const input = getByLabelText('Version name')
    fireEvent.change(input, { target: { value: 'My' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() => expect(api.createVersion).toHaveBeenCalledWith('wb', 'My'))
    await findByText('My')
  })

  it('restore invokes api.restoreVersion', async () => {
    const api = makeApi([{ id: 'v1', workbookId: 'wb', name: 'V1', createdBy: 'u', createdAt: '' }])
    const { findByText, getByText } = render(<VersionHistoryPanel api={api as never} workbookId="wb" />)
    await findByText('V1')
    fireEvent.click(getByText('Restore'))
    await waitFor(() => expect(api.restoreVersion).toHaveBeenCalledWith('wb', 'v1'))
  })
})
```

- [ ] **Step 12.2: Implement**

Create `packages/react/src/VersionHistoryPanel.tsx`:

```tsx
import type { ApiClient, Version } from '@ensemble/core'
import { useCallback, useEffect, useState } from 'react'

export interface VersionHistoryPanelProps {
  api: Pick<ApiClient, 'listVersions' | 'createVersion' | 'restoreVersion'>
  workbookId: string
  onRestore?: () => void
}

export function VersionHistoryPanel({ api, workbookId, onRestore }: VersionHistoryPanelProps) {
  const [items, setItems] = useState<Version[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const refresh = useCallback(async () => {
    const { items } = await api.listVersions(workbookId)
    setItems(items)
  }, [api, workbookId])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="ensemble-version-history">
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <strong>Version history</strong>
        <button aria-label="Save version" onClick={() => setCreating(true)}>+</button>
      </header>
      {creating && (
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!draftName.trim()) return
          await api.createVersion(workbookId, draftName)
          setCreating(false); setDraftName('')
          await refresh()
        }}>
          <input aria-label="Version name" value={draftName}
                 onChange={(e) => setDraftName(e.target.value)} autoFocus />
        </form>
      )}
      <ul>
        {items.map((v) => (
          <li key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span>{v.name}</span>
            <button onClick={async () => { await api.restoreVersion(workbookId, v.id); onRestore?.() }}>
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Edit `packages/react/src/index.ts` to export.

- [ ] **Step 12.3: Run + commit**

```bash
pnpm --filter @ensemble/react test
git add packages/react
git commit -m "feat(react): <VersionHistoryPanel /> component"
```

---

## Task 13: Vue `<VersionHistoryPanel />`

**Files:**
- Create: `packages/vue/src/VersionHistoryPanel.vue`
- Create: `packages/vue/test/VersionHistoryPanel.test.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 13.1: Failing test**

Create `packages/vue/test/VersionHistoryPanel.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import VersionHistoryPanel from '../src/VersionHistoryPanel.vue'

function makeApi(initial: { id: string; name: string }[] = []) {
  let items = initial
  return {
    listVersions: vi.fn(async () => ({ items })),
    createVersion: vi.fn(async (_wb: string, name: string) => {
      const v = { id: 'n' + items.length, name }
      items = [...items, v as never]
      return v
    }),
    restoreVersion: vi.fn(async () => ({ id: 'r1' })),
  }
}

describe('<VersionHistoryPanel /> Vue', () => {
  it('renders fetched versions', async () => {
    const api = makeApi([{ id: 'v1', name: 'V1' }])
    const wrapper = mount(VersionHistoryPanel, { props: { api, workbookId: 'wb' } })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('V1')
  })
  it('creates version on submit', async () => {
    const api = makeApi()
    const wrapper = mount(VersionHistoryPanel, { props: { api, workbookId: 'wb' } })
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="Save version"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('input[aria-label="Version name"]').setValue('My v')
    await wrapper.find('form').trigger('submit.prevent')
    expect(api.createVersion).toHaveBeenCalled()
  })
})
```

- [ ] **Step 13.2: Implement**

Create `packages/vue/src/VersionHistoryPanel.vue`:

```vue
<script setup lang="ts">
import type { ApiClient, Version } from '@ensemble/core'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  api: Pick<ApiClient, 'listVersions' | 'createVersion' | 'restoreVersion'>
  workbookId: string
}>()
const emit = defineEmits<{ restored: [] }>()

const items = ref<Version[]>([])
const creating = ref(false)
const draftName = ref('')

async function refresh() {
  const { items: list } = await props.api.listVersions(props.workbookId)
  items.value = list
}
async function submit() {
  if (!draftName.value.trim()) return
  await props.api.createVersion(props.workbookId, draftName.value)
  creating.value = false; draftName.value = ''
  await refresh()
}
async function restore(versionId: string) {
  await props.api.restoreVersion(props.workbookId, versionId)
  emit('restored')
}
onMounted(refresh)
</script>

<template>
  <div class="ensemble-version-history">
    <header style="display: flex; gap: 8px; align-items: center">
      <strong>Version history</strong>
      <button aria-label="Save version" @click="creating = true">+</button>
    </header>
    <form v-if="creating" @submit.prevent="submit">
      <input v-model="draftName" aria-label="Version name" autofocus />
    </form>
    <ul>
      <li v-for="v in items" :key="v.id" style="display: flex; gap: 12px; align-items: center">
        <span>{{ v.name }}</span>
        <button @click="restore(v.id)">Restore</button>
      </li>
    </ul>
  </div>
</template>
```

Edit `packages/vue/src/index.ts` to export.

- [ ] **Step 13.3: Run + commit**

```bash
pnpm --filter @ensemble/vue test
git add packages/vue
git commit -m "feat(vue): <VersionHistoryPanel /> SFC"
```

> **🟢 M3 checkpoint**

---

# Milestone 4 — xlsx export + conformance suite

## Task 14: Server-side xlsx export

**Files:**
- Modify: `packages/server/package.json` (xlsx 0.18.5 dep)
- Create: `packages/server/src/services/xlsx-export-service.ts`
- Create: `packages/server/src/http/routes/export-xlsx.ts`
- Modify: `packages/server/src/http/app.ts` (register)
- Create: `packages/server/test/integration/export-xlsx.int.test.ts`

- [ ] **Step 14.1: Add xlsx dep**

`packages/server/package.json` deps: `"xlsx": "0.18.5"`. Then `pnpm install`.

- [ ] **Step 14.2: Service**

Create `packages/server/src/services/xlsx-export-service.ts`:

```ts
import * as XLSX from 'xlsx'
import type { WorkbookData } from './mask-service'

export function exportToXlsx(data: WorkbookData): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId]
    if (!sheet) continue
    const aoa: unknown[][] = []
    for (const rStr of Object.keys(sheet.cellData)) {
      const r = Number(rStr)
      const row = sheet.cellData[rStr]
      if (!row) continue
      const aoaRow = (aoa[r] ??= [])
      for (const cStr of Object.keys(row)) {
        const c = Number(cStr)
        const cell = row[cStr]
        if (cell) aoaRow[c] = cell.v
      }
    }
    for (let r = 0; r < aoa.length; r++) aoa[r] ??= []
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
```

- [ ] **Step 14.3: Route**

Create `packages/server/src/http/routes/export-xlsx.ts`:

```ts
import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import { exportToXlsx } from '../../services/xlsx-export-service'
import { applyMaskRules, type WorkbookData } from '../../services/mask-service'
import type { AppEnv } from '../app'

export const exportXlsxRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get(
    '/api/v1/workbooks/:wbId/export.xlsx',
    requireCapability('canView', (c) => ({
      type: 'workbook', id: c.req.param('wbId'), tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const idCtx = c.get('identity')!
      const wbId = c.req.param('wbId')
      const wb = await c.get('services').workbooks.get({ tenantId: idCtx.tenantId, id: wbId })
      if (!wb) return c.json({ error: 'not found' }, 404)
      const snap = await c.get('services').snapshots.getLatest(wb.id)
      if (!snap) return c.body(null, 204)
      const bytes = await c.get('deps').storage.get(snap.storageKey)
      const data = JSON.parse(new TextDecoder().decode(bytes)) as WorkbookData
      const rules = await c.get('services').masks.get(idCtx, wb.id)
      const masked = rules.length > 0 ? applyMaskRules(data, rules) : data
      const xlsxBytes = exportToXlsx(masked)
      return c.body(xlsxBytes, 200, {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${wb.name.replace(/[^a-zA-Z0-9._-]/g, '_')}.xlsx"`,
      })
    }
  )
```

Wire into `app.ts`: `app.route('/', exportXlsxRoute)`.

- [ ] **Step 14.4: Integration test**

Create `packages/server/test/integration/export-xlsx.int.test.ts`:

```ts
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('GET .xlsx', () => {
  it('returns xlsx with latest snapshot data', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'xlsx-t' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const blobs = new Map<string, Uint8Array>()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: {
        put: async (k, b) => { blobs.set(k, b) },
        get: async (k) => blobs.get(k) ?? new Uint8Array(),
        delete: async (k) => { blobs.delete(k) },
      },
      event: new NoopEventAdapter(),
    })

    const payload = {
      id: wb.id, sheetOrder: ['s1'],
      sheets: { s1: { id: 's1', name: 'G', cellData: { '0': { '0': { v: 'Name' }, '1': { v: 'Score' } }, '1': { '0': { v: 'Alice' }, '1': { v: 90 } } } } },
    }
    await app.request(`/api/v1/workbooks/${wb.id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })

    const res = await app.request(`/api/v1/workbooks/${wb.id}/export.xlsx`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(200)
    const xlsxBytes = new Uint8Array(await res.arrayBuffer())
    const wbBack = XLSX.read(xlsxBytes, { type: 'array' })
    const aoa = XLSX.utils.sheet_to_json(wbBack.Sheets[wbBack.SheetNames[0]!]!, { header: 1 })
    expect(aoa).toEqual([['Name', 'Score'], ['Alice', 90]])
  })
})
```

- [ ] **Step 14.5: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/export-xlsx.int.test.ts
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): GET /workbooks/:id/export.xlsx with mask-applied SheetJS export"
```

---

## Task 15-17: `@ensemble/adapter-conformance`

**Files:**
- Create: `packages/adapter-conformance/package.json` + `tsconfig.json` + `vitest.config.ts`
- Create: `packages/adapter-conformance/src/{identity,permission,storage,event,index}.ts`
- Create: `packages/adapter-conformance/test/self-conformance.test.ts`

- [ ] **Step 15.1: Package skeleton**

Create `packages/adapter-conformance/package.json`:

```json
{
  "name": "@ensemble/adapter-conformance",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "license": "Apache-2.0",
  "repository": { "type": "git", "url": "https://github.com/kdldbq/ensemble.git", "directory": "packages/adapter-conformance" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": { "@ensemble/server": "workspace:*", "vitest": "^2.1.0" },
  "devDependencies": { "@ensemble/server": "workspace:*", "vitest": "2.1.4" }
}
```

Create `packages/adapter-conformance/tsconfig.json` (same pattern as storage-fs).

Create `packages/adapter-conformance/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['test/**/*.test.ts'] } })
```

- [ ] **Step 15.2: identity.ts**

Create `packages/adapter-conformance/src/identity.ts`:

```ts
import type { IdentityAdapter } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export interface IdentityConformanceFixture {
  validToken: string | (() => Promise<string>)
  expectedTenantId: string
  expectedUserId: string
  invalidToken: string | (() => Promise<string>)
}

export function runIdentityConformance(
  name: string,
  adapterFactory: () => IdentityAdapter,
  fixture: IdentityConformanceFixture
): void {
  describe(`IdentityAdapter conformance: ${name}`, () => {
    it('resolves valid token', async () => {
      const adapter = adapterFactory()
      const token = typeof fixture.validToken === 'function' ? await fixture.validToken() : fixture.validToken
      const ctx = await adapter.resolveFromToken(token)
      expect(ctx.tenantId).toBe(fixture.expectedTenantId)
      expect(ctx.userId).toBe(fixture.expectedUserId)
    })
    it('rejects invalid token', async () => {
      const adapter = adapterFactory()
      const token = typeof fixture.invalidToken === 'function' ? await fixture.invalidToken() : fixture.invalidToken
      await expect(adapter.resolveFromToken(token)).rejects.toThrow()
    })
  })
}
```

- [ ] **Step 15.3: permission.ts**

Create `packages/adapter-conformance/src/permission.ts`:

```ts
import type { Capability, IdentityContext, PermissionAdapter, ResourceRef } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export interface PermissionConformanceFixture {
  identity: IdentityContext
  resource: ResourceRef
  expectedCapabilities: Partial<Capability>
}

export function runPermissionConformance(
  name: string,
  adapterFactory: () => PermissionAdapter,
  fixture: PermissionConformanceFixture
): void {
  describe(`PermissionAdapter conformance: ${name}`, () => {
    it('capability shape has 4 booleans', async () => {
      const adapter = adapterFactory()
      const caps = await adapter.getCapabilities(fixture.identity, fixture.resource)
      for (const k of ['canView', 'canEdit', 'canShare', 'canDelete'] as const) {
        expect(typeof caps[k]).toBe('boolean')
      }
    })
    it('matches expected capabilities', async () => {
      const adapter = adapterFactory()
      const caps = await adapter.getCapabilities(fixture.identity, fixture.resource)
      for (const [k, v] of Object.entries(fixture.expectedCapabilities)) {
        expect(caps[k as keyof Capability]).toBe(v)
      }
    })
    it('getMaskRules returns an array', async () => {
      const adapter = adapterFactory()
      const rules = await adapter.getMaskRules(fixture.identity, fixture.resource)
      expect(Array.isArray(rules)).toBe(true)
    })
  })
}
```

- [ ] **Step 15.4: storage.ts + event.ts + index.ts**

Create `packages/adapter-conformance/src/storage.ts`:

```ts
import type { StorageAdapter } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export function runStorageConformance(name: string, adapterFactory: () => StorageAdapter): void {
  describe(`StorageAdapter conformance: ${name}`, () => {
    it('put then get round-trips bytes', async () => {
      const a = adapterFactory()
      const key = 'conformance/' + Math.random().toString(36).slice(2)
      await a.put(key, new TextEncoder().encode('hello'))
      const back = await a.get(key)
      expect(new TextDecoder().decode(back)).toBe('hello')
      await a.delete(key)
    })
    it('delete then get throws or returns empty', async () => {
      const a = adapterFactory()
      const key = 'conformance/' + Math.random().toString(36).slice(2)
      await a.put(key, new Uint8Array([1, 2, 3]))
      await a.delete(key)
      let threw = false; let len = -1
      try { const back = await a.get(key); len = back.byteLength } catch { threw = true }
      expect(threw || len === 0).toBe(true)
    })
  })
}
```

Create `packages/adapter-conformance/src/event.ts`:

```ts
import type { EnsembleEvent, EventAdapter } from '@ensemble/server'
import { describe, expect, it } from 'vitest'

export function runEventConformance(name: string, adapterFactory: () => EventAdapter): void {
  describe(`EventAdapter conformance: ${name}`, () => {
    it('publish resolves for all 5 event types', async () => {
      const a = adapterFactory()
      const events: EnsembleEvent[] = [
        { type: 'workbook.created', workbookId: 'w', userId: 'u', at: new Date().toISOString() },
        { type: 'workbook.opened', workbookId: 'w', userId: 'u', at: new Date().toISOString() },
        { type: 'workbook.edited', workbookId: 'w', userId: 'u', batchedOpsCount: 0, at: new Date().toISOString() },
        { type: 'folder.created', folderId: 'f', userId: 'u', at: new Date().toISOString() },
        { type: 'share.granted', grantId: 'g', grantedBy: 'u', at: new Date().toISOString() },
      ]
      for (const e of events) await expect(a.publish(e)).resolves.toBeUndefined()
    })
  })
}
```

Create `packages/adapter-conformance/src/index.ts`:

```ts
export * from './identity'
export * from './permission'
export * from './storage'
export * from './event'
```

- [ ] **Step 15.5: Self-conformance test**

Create `packages/adapter-conformance/test/self-conformance.test.ts`:

```ts
import { NoopEventAdapter } from '@ensemble/server'
import {
  runEventConformance, runPermissionConformance, runStorageConformance,
} from '../src/index'

runStorageConformance('in-memory', () => {
  const m = new Map<string, Uint8Array>()
  return {
    put: async (k, b) => { m.set(k, b) },
    get: async (k) => {
      const v = m.get(k); if (!v) throw new Error('not found'); return v
    },
    delete: async (k) => { m.delete(k) },
  }
})

runEventConformance('NoopEventAdapter', () => new NoopEventAdapter())

runPermissionConformance(
  'allow-all',
  () => ({
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }),
  {
    identity: { tenantId: 't', userId: 'u' },
    resource: { type: 'workbook', id: 'w', tenantId: 't' },
    expectedCapabilities: { canView: true, canEdit: true },
  }
)
```

- [ ] **Step 16-17: Run + commit (combined)**

```bash
pnpm install
pnpm --filter @ensemble/server build  # for type-only peer dep
pnpm --filter @ensemble/adapter-conformance test
git add packages/adapter-conformance pnpm-lock.yaml
git commit -m "feat(adapter-conformance): test factory package for 4 adapter contracts"
```

> **🟢 M4 checkpoint**

---

# Milestone 5 — Docs site

## Task 18: Astro Starlight skeleton

**Files:**
- Create: `apps/docs/package.json`
- Create: `apps/docs/astro.config.mjs`
- Create: `apps/docs/src/content/docs/index.mdx`
- Create: `apps/docs/tsconfig.json` (if needed)

- [ ] **Step 18.1: package + config**

Create `apps/docs/package.json`:

```json
{
  "name": "@ensemble/docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview"
  },
  "dependencies": {
    "astro": "4.16.0",
    "@astrojs/starlight": "0.28.3"
  }
}
```

Create `apps/docs/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  integrations: [
    starlight({
      title: 'ensemble',
      description: 'Open-source collaborative spreadsheet platform',
      social: { github: 'https://github.com/kdldbq/ensemble' },
      sidebar: [
        { label: 'Getting started', items: [
          { label: 'Introduction', link: '/' },
          { label: 'Quickstart', link: '/quickstart/' },
        ]},
        { label: 'API reference', items: [
          { label: 'REST endpoints', link: '/api/rest/' },
          { label: 'WebSocket protocol', link: '/api/ws-protocol/' },
        ]},
        { label: 'Integration', items: [
          { label: 'TypeScript host', link: '/integration/typescript/' },
          { label: 'Webhook (any-language) host', link: '/integration/webhook/' },
          { label: 'FastAPI host', link: '/integration/fastapi/' },
        ]},
      ],
    }),
  ],
})
```

- [ ] **Step 18.2: index landing**

Create `apps/docs/src/content/docs/index.mdx`:

```mdx
---
title: ensemble
description: Open-source collaborative spreadsheet platform.
---

ensemble is an open-source collaborative spreadsheet platform you embed into
any host application. It packages [Univer](https://univer.ai) (Apache 2.0) as
the browser editor and ships a self-built backend for realtime collaboration,
file management, and host-pluggable permission / data-masking.

## Where to start

- **Quickstart** — single-user editor in your Node host
- **WebSocket protocol** — the wire format for realtime collaboration
- **Webhook integration** — embed in any-language host
- **FastAPI host example** — full Python integration

## License

Apache 2.0.
```

- [ ] **Step 18.3: Run + commit**

```bash
pnpm install
pnpm --filter @ensemble/docs build
git add apps/docs pnpm-lock.yaml
git commit -m "feat(docs): Astro Starlight skeleton"
```

---

## Task 19: Quickstart page

**Files:**
- Create: `apps/docs/src/content/docs/quickstart.mdx`

- [ ] **Step 19.1: Write**

Create `apps/docs/src/content/docs/quickstart.mdx`:

```mdx
---
title: Quickstart
description: Run ensemble locally in under five minutes.
---

## Prerequisites

- Node 20+, pnpm 9
- Docker (for Postgres + Redis)

## Clone + install

```bash
git clone https://github.com/kdldbq/ensemble.git
cd ensemble
pnpm install
```

## Start the demo

```bash
pnpm --filter @ensemble/demo db:up     # Postgres on :54320, Redis on :63790
pnpm --filter @ensemble/server build
DATABASE_URL=postgres://postgres:postgres@localhost:54320/ensemble_dev \
  pnpm --filter @ensemble/server exec node dist/db/migrate.js
pnpm --filter @ensemble/demo dev
```

Open http://localhost:5173. You'll see a two-pane editor — left is `admin`,
right is `viewer`. Type any value in admin's column B and save — viewer's
column B shows `***` (mask rule defined in the demo's PermissionAdapter).

## Embed in your React app

```bash
pnpm add @ensemble/react @ensemble/core
```

```tsx
import { WorkbookEditor } from '@ensemble/react'

<WorkbookEditor
  workbookId="<uuid>"
  apiBaseUrl="https://api.your-host.com"
  wsBaseUrl="wss://api.your-host.com"
  token={async () => await getJwtFromYourHost()}
/>
```

See [REST endpoints](/api/rest/) and [WebSocket protocol](/api/ws-protocol/).
```

- [ ] **Step 19.2: Commit**

```bash
git add apps/docs/src/content/docs/quickstart.mdx
git commit -m "docs: quickstart page"
```

---

## Task 20: REST + WS protocol reference

**Files:**
- Create: `apps/docs/src/content/docs/api/rest.mdx`
- Create: `apps/docs/src/content/docs/api/ws-protocol.mdx`

- [ ] **Step 20.1: REST reference**

Create `apps/docs/src/content/docs/api/rest.mdx`:

(Use the table-of-endpoints content from this plan's full version — workbooks, snapshots, versions, folders, grants, export.)

```mdx
---
title: REST API
description: HTTP endpoints exposed by @ensemble/server.
---

All endpoints require `Authorization: Bearer <jwt>` (verified by the
configured `IdentityAdapter`). Tenant isolation is enforced by Postgres RLS.

## Workbooks

| Method | Path | Capability |
|--------|------|------------|
| POST   | `/api/v1/workbooks` | — |
| GET    | `/api/v1/workbooks` | — (filterListVisibility) |
| GET    | `/api/v1/workbooks/:id` | canView |
| DELETE | `/api/v1/workbooks/:id` | canDelete |

## Snapshots

| Method | Path | Capability |
|--------|------|------------|
| POST   | `/api/v1/workbooks/:wbId/snapshots?reason=...&name=...` | canEdit |
| GET    | `/api/v1/workbooks/:wbId/snapshot` | canView |
| GET    | `/api/v1/workbooks/:wbId/snapshots/:id/blob` | canView |

## Versions

| Method | Path | Capability |
|--------|------|------------|
| GET    | `/api/v1/workbooks/:wbId/versions` | canView |
| POST   | `/api/v1/workbooks/:wbId/versions` `{name}` | canEdit |
| POST   | `/api/v1/workbooks/:wbId/restore/:versionId` | canEdit |

## Folders

| Method | Path | Capability |
|--------|------|------------|
| GET    | `/api/v1/folders` | — (filterListVisibility) |
| POST   | `/api/v1/folders` `{name, parentId, spaceType}` | canEdit on parent (if non-null) |
| PATCH  | `/api/v1/folders/:id` | canEdit |
| DELETE | `/api/v1/folders/:id` | canDelete |

## Grants

| Method | Path | Capability |
|--------|------|------------|
| POST   | `/api/v1/grants` | canShare on resource |
| DELETE | `/api/v1/grants/:id` | canShare on underlying resource |

## Export

| Method | Path | Capability |
|--------|------|------------|
| GET    | `/api/v1/workbooks/:wbId/export.xlsx` | canView |

## Errors

JSON: `{ "error": "<message>" }`. 400 / 401 / 403 / 404 / 500.
```

- [ ] **Step 20.2: WS reference**

Create `apps/docs/src/content/docs/api/ws-protocol.mdx`:

```mdx
---
title: WebSocket protocol
description: Realtime collaboration frames over WSS.
---

## Connection

```
WSS /api/v1/ws/:workbookId?token=<jwt>&last_seq=<optional>
```

`last_seq` triggers replay if gap ≤200, else welcome is treated as cold start.

## Welcome (server → client, once)

```json
{
  "type": "welcome", "workbookId": "...", "seqNum": 42,
  "snapshot": {...}, "presence": [...], "locks": [...]
}
```

## Client → server

| Frame | Fields |
|-------|--------|
| `acquire_lock` | `region` |
| `release_lock` | `region` |
| `submit_mutation` | `clientSeq, region, payload` |
| `presence_heartbeat` | `cursor?, selection?` |

## Server → client

| Frame | When |
|-------|------|
| `lock_granted` | your acquire succeeded |
| `lock_denied` | your acquire failed (ownerId is current holder) |
| `lock_acquired` | room broadcast when any client locks |
| `lock_released` | broadcast on release / TTL expiry |
| `mutation_accepted` | your submit was persisted |
| `apply_mutation` | room broadcast (per-recipient masked) |
| `presence_update` | broadcast on heartbeat |
| `user_left` | broadcast on disconnect / 15s no-heartbeat |
| `replay_complete` | after last_seq replay |
| `error` | `code: rate_limited \| lock_not_held \| ...` |

## Backpressure

30 ops/sec token bucket per connection on `submit_mutation`. Over-cap returns
`{type:"error", code:"rate_limited"}` and frame is dropped.
```

- [ ] **Step 20.3: Commit**

```bash
git add apps/docs/src/content/docs/api
git commit -m "docs: REST + WS protocol references"
```

---

## Task 21: Integration guides

**Files:**
- Create: `apps/docs/src/content/docs/integration/typescript.mdx`
- Create: `apps/docs/src/content/docs/integration/webhook.mdx`
- Create: `apps/docs/src/content/docs/integration/fastapi.mdx`

- [ ] **Step 21.1: TypeScript guide**

Create `apps/docs/src/content/docs/integration/typescript.mdx`:

```mdx
---
title: TypeScript host
description: Embed ensemble in your Node backend.
---

## Install

```bash
pnpm add @ensemble/server @ensemble/identity-jwks @ensemble/storage-s3
```

## Boot

```ts
import { createServer } from '@ensemble/server'
import { JwksIdentityAdapter } from '@ensemble/identity-jwks'
import { S3Storage } from '@ensemble/storage-s3'

const server = createServer({
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  identity: new JwksIdentityAdapter({
    jwksUrl: 'https://your-host.com/.well-known/jwks.json',
    issuer: 'https://your-host.com',
    audience: 'ensemble',
  }),
  permission: {
    getCapabilities: async (id, resource) => ({
      canView: true, canEdit: true, canShare: false, canDelete: false,
    }),
    getMaskRules: async () => [],
  },
  storage: new S3Storage({ bucket: 'ensemble-prod', region: 'us-east-1', credentials: { ... } }),
  event: { publish: async (ev) => console.log('event:', ev.type) },
})
await server.listen({ port: 3000 })
```

## React component

```tsx
import { WorkbookEditor, VersionHistoryPanel, CellLockOverlay } from '@ensemble/react'
```
```

- [ ] **Step 21.2: Webhook guide**

Create `apps/docs/src/content/docs/integration/webhook.mdx`:

```mdx
---
title: Webhook (any-language) host
description: Integrate ensemble from a non-Node host via signed HTTP webhooks.
---

If your host is Python / Go / PHP / Rust / Ruby, implement adapter contracts
as HTTP endpoints. ensemble's `WebhookAdapter` calls your endpoints over HTTP
with HMAC-SHA256 signatures.

## Endpoint contracts

### POST /api/ensemble/identity
Request: `{ token }` → Response: `IdentityContext`.

### POST /api/ensemble/permission
Request: `{ op: "capabilities" | "mask_rules", identity, resource }`.

### POST /api/ensemble/event
Request: `EnsembleEvent` → Response: 204. Errors swallowed.

## Verify signatures

```python
import hmac, hashlib
sig = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
assert hmac.compare_digest(sig, request.headers["X-Ensemble-Signature"])
```

See [FastAPI host](/integration/fastapi/) for a working example.
```

- [ ] **Step 21.3: FastAPI guide**

Create `apps/docs/src/content/docs/integration/fastapi.mdx`:

```mdx
---
title: FastAPI host (Python)
description: Reference Python integration.
---

Full example in `examples/integrate-fastapi/`. Matches what EduCube uses.

```
examples/integrate-fastapi/
  app/
    main.py        # FastAPI: JWT issuer + 3 webhook endpoints
    identity.py
    permission.py
    event.py
  ui/
    index.html + main.ts   # Vue <WorkbookEditor>
```

## Run

```bash
cd examples/integrate-fastapi
poetry install
HOST_SECRET=dev-secret poetry run uvicorn app.main:app --reload
```

Point ensemble at it:

```ts
identity: new WebhookIdentityAdapter({ url: 'http://localhost:8000/api/ensemble/identity', secret: 'dev-secret' })
```

See the example's `README.md` for full setup.
```

- [ ] **Step 21.4: Commit**

```bash
git add apps/docs/src/content/docs/integration
git commit -m "docs: integration guides (TypeScript / Webhook / FastAPI)"
```

> **🟢 M5 checkpoint**

---

# Milestone 6 — Ship

## Task 22: NOTICE + CHANGELOG + license header script

**Files:**
- Create: `NOTICE`
- Create: `CHANGELOG.md`
- Create: `scripts/add-headers.mjs`

- [ ] **Step 22.1: NOTICE**

Create `NOTICE`:

```
ensemble
Copyright 2026 kdldbq and ensemble contributors

This product includes software developed by:
- Univer (https://univer.ai) — Apache 2.0
- Hono (https://hono.dev) — MIT
- Drizzle ORM (https://orm.drizzle.team) — Apache 2.0
- jose (https://github.com/panva/jose) — MIT
- ioredis (https://github.com/redis/ioredis) — MIT
- SheetJS Community Edition (https://sheetjs.com/) — Apache 2.0
- Astro Starlight (https://starlight.astro.build/) — MIT

See LICENSE for the full Apache 2.0 license text.
```

- [ ] **Step 22.2: CHANGELOG**

Create `CHANGELOG.md`:

```markdown
# Changelog

## [0.1.0] — 2026-MM-DD

### Added
- Single-user workbook editor (`@ensemble/core` + `@ensemble/react` + `@ensemble/vue`)
- xlsx ↔ Univer JSON conversion in the browser
- `@ensemble/server` REST: workbooks, snapshots, folders, grants, versions, xlsx export
- WebSocket realtime: cell-lock + per-recipient masked broadcast
- Multi-tenant Postgres RLS (6 tables + audit log)
- `@ensemble/identity-jwks` (JWKS-based IdentityAdapter)
- `@ensemble/storage-s3` + `@ensemble/storage-fs`
- `@ensemble/webhook` for non-Node host integration
- `@ensemble/adapter-conformance` test factory package
- Last_seq reconnect replay + 30 ops/sec backpressure
- Snapshot masking with Redis pub/sub invalidation
- Two-pane masked-view + multi-context Playwright e2e
- FastAPI integration example
- Astro Starlight docs
- Apache 2.0 + NOTICE

[0.1.0]: https://github.com/kdldbq/ensemble/releases/tag/v0.1.0
```

- [ ] **Step 22.3: License header script**

Create `scripts/add-headers.mjs`:

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const HEADER = `/**
 * Copyright 2026 kdldbq and ensemble contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * See LICENSE for details.
 */
`

const files = execSync(
  'git ls-files "packages/*/src/**/*.ts" "packages/*/src/**/*.tsx" "packages/*/src/**/*.vue"',
  { encoding: 'utf8' }
).trim().split('\n').filter(Boolean)

let added = 0
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  if (content.startsWith('/**') && content.includes('Apache License')) continue
  writeFileSync(file, HEADER + content)
  added++
}
console.log(`Headers: +${added}, skipped ${files.length - added}`)
```

(Idempotent. Not auto-run.)

- [ ] **Step 22.4: Commit**

```bash
git add NOTICE CHANGELOG.md scripts
git commit -m "chore: NOTICE + CHANGELOG v0.1.0 + Apache-2.0 header injector"
```

---

## Task 23: FastAPI example

**Files:**
- Create: `examples/integrate-fastapi/pyproject.toml`
- Create: `examples/integrate-fastapi/app/{main,identity,permission,event}.py`
- Create: `examples/integrate-fastapi/ui/index.html`
- Create: `examples/integrate-fastapi/ui/main.ts`
- Create: `examples/integrate-fastapi/README.md`

- [ ] **Step 23.1: pyproject + main.py**

Create `examples/integrate-fastapi/pyproject.toml`:

```toml
[project]
name = "ensemble-fastapi-example"
version = "0.0.1"
requires-python = ">=3.11"
dependencies = [
  "fastapi>=0.115",
  "uvicorn>=0.30",
  "pyjwt[crypto]>=2.9",
  "cryptography>=43",
]
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"
```

Create `examples/integrate-fastapi/app/main.py`:

```python
import hashlib, hmac, json, os
from datetime import datetime, timedelta

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, PlainTextResponse

from .identity import resolve_identity
from .permission import capabilities_for, mask_rules_for
from .event import handle_event

app = FastAPI(title="ensemble FastAPI host example")

HOST_SECRET = os.environ.get("HOST_SECRET", "dev-secret").encode()
_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
KEY_PEM = _KEY.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)
PUBLIC_JWK = jwt.algorithms.RSAAlgorithm.to_jwk(_KEY.public_key())


@app.get("/.well-known/jwks.json")
def jwks() -> dict:
    return {"keys": [json.loads(PUBLIC_JWK) | {"kid": "demo-key", "alg": "RS256", "use": "sig"}]}


@app.post("/issue-token")
def issue_token(user_id: str, tenant_id: str) -> dict:
    now = datetime.utcnow()
    payload = {
        "iss": "fastapi-host", "aud": "ensemble", "sub": user_id, "tenant_id": tenant_id,
        "iat": int(now.timestamp()), "exp": int((now + timedelta(hours=1)).timestamp()),
    }
    token = jwt.encode(payload, _KEY, algorithm="RS256", headers={"kid": "demo-key"})
    return {"token": token}


def _verify(request: Request, body: bytes) -> None:
    expected = "sha256=" + hmac.new(HOST_SECRET, body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("X-Ensemble-Signature", "")):
        raise HTTPException(status_code=401, detail="bad signature")


@app.post("/api/ensemble/identity")
async def ep_identity(request: Request) -> JSONResponse:
    body = await request.body(); _verify(request, body)
    return JSONResponse(resolve_identity(json.loads(body)["token"]))


@app.post("/api/ensemble/permission")
async def ep_permission(request: Request) -> JSONResponse:
    body = await request.body(); _verify(request, body)
    data = json.loads(body)
    if data["op"] == "capabilities":
        return JSONResponse(capabilities_for(data["identity"], data["resource"]))
    if data["op"] == "mask_rules":
        return JSONResponse(mask_rules_for(data["identity"], data["resource"]))
    return JSONResponse({"error": "unknown op"}, status_code=400)


@app.post("/api/ensemble/event")
async def ep_event(request: Request) -> PlainTextResponse:
    body = await request.body(); _verify(request, body)
    handle_event(json.loads(body))
    return PlainTextResponse("", status_code=204)
```

- [ ] **Step 23.2: identity / permission / event modules**

Create `examples/integrate-fastapi/app/identity.py`:

```python
import jwt
from fastapi import HTTPException


def resolve_identity(token: str) -> dict:
    try:
        payload = jwt.decode(token, options={"verify_signature": False}, audience="ensemble")
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return {
        "tenantId": payload["tenant_id"], "userId": payload["sub"],
        "email": payload.get("email"), "roles": payload.get("roles", []),
    }
```

Create `examples/integrate-fastapi/app/permission.py`:

```python
def capabilities_for(identity: dict, resource: dict) -> dict:
    if "admin" in (identity.get("roles") or []):
        return {"canView": True, "canEdit": True, "canShare": True, "canDelete": True}
    return {"canView": True, "canEdit": False, "canShare": False, "canDelete": False}


def mask_rules_for(identity: dict, resource: dict) -> list:
    if "admin" in (identity.get("roles") or []):
        return []
    return [{
        "match": {"type": "column", "sheet": "*", "column": "B"},
        "action": {"type": "redact", "replacement": "***"},
    }]
```

Create `examples/integrate-fastapi/app/event.py`:

```python
def handle_event(event: dict) -> None:
    print(f"[ensemble event] {event['type']} at={event['at']}")
```

- [ ] **Step 23.3: UI + README**

Create `examples/integrate-fastapi/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>FastAPI ensemble example</title>
    <style>html,body,#app{height:100%;margin:0}</style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

Create `examples/integrate-fastapi/ui/main.ts`:

```ts
import { createApp, h } from 'vue'
import { WorkbookEditor } from '@ensemble/vue'

async function getToken(): Promise<string> {
  const r = await fetch('http://localhost:8000/issue-token?user_id=alice&tenant_id=00000000-0000-0000-0000-000000000001', { method: 'POST' })
  const { token } = await r.json() as { token: string }
  return token
}

const App = {
  setup() {
    return () => h(WorkbookEditor, {
      workbookId: '<paste-a-workbook-uuid>',
      apiBaseUrl: 'http://localhost:3000',
      wsBaseUrl: 'ws://localhost:3000',
      token: getToken,
    })
  },
}

createApp(App).mount('#app')
```

Create `examples/integrate-fastapi/README.md`:

```markdown
# FastAPI ensemble integration example

Integrates ensemble into a Python / FastAPI host:

1. Issues JWTs for your users (demo only; replace with real auth)
2. Exposes the 3 ensemble webhook endpoints (identity / permission / event)
3. Embeds Vue `<WorkbookEditor>` in a static HTML page

## Run

Terminal 1 — FastAPI host:

```bash
cd examples/integrate-fastapi
poetry install
HOST_SECRET=dev-secret poetry run uvicorn app.main:app --reload
```

Terminal 2 — ensemble server pointed at the FastAPI host (build a runner
based on `apps/demo/src/server-runner.ts`, swapping in `WebhookAdapter`
variants pointed at http://localhost:8000).

Terminal 3 — UI:

```bash
cd examples/integrate-fastapi/ui
pnpm dlx serve .
```
```

- [ ] **Step 23.4: Commit**

```bash
git add examples/integrate-fastapi
git commit -m "feat(examples): FastAPI host integration (Python webhook + Vue UI)"
```

---

## Task 24: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 24.1: Workflow**

Create `.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    branches: [main]
jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'pnpm', registry-url: 'https://registry.npmjs.org' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: changesets/action@v1
        with:
          publish: pnpm exec changeset publish
          version: pnpm exec changeset version
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 24.2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: changesets release workflow (npm publish + GitHub release)"
```

---

## Task 25: Initial v0.1.0 changeset + decision gates

**Files:**
- Create: `.changeset/initial-v0.1.0.md`

- [ ] **Step 25.1: Changeset**

Create `.changeset/initial-v0.1.0.md`:

```markdown
---
"@ensemble/core": minor
"@ensemble/server": minor
"@ensemble/react": minor
"@ensemble/vue": minor
"@ensemble/storage-fs": minor
"@ensemble/storage-s3": minor
"@ensemble/webhook": minor
"@ensemble/identity-jwks": minor
"@ensemble/adapter-conformance": minor
---

Initial v0.1.0 GA release. Single-user editing, multi-tenant RLS, realtime
collaboration with cell-lock + masked broadcast, version history, server-side
xlsx export, conformance test suite, FastAPI integration example, docs site.
```

- [ ] **Step 25.2: Decision gates (documented, not executed)**

Before pushing publicly, the user must decide (spec §11):

1. Product name trademark check
2. GitHub org (personal `kdldbq` vs new org)
3. Domain (`ensemble.dev` / `.sh` / `.com`)
4. npm `@ensemble` scope owner (matches org)

These are not code changes — Sprint 4 final report calls them out. Plan does
**not** auto-push or publish.

- [ ] **Step 25.3: Commit**

```bash
git add .changeset
git commit -m "chore: changeset for v0.1.0 initial release"
```

---

## Task 26: README v0.1.0 GA status

**Files:**
- Modify: `README.md`

- [ ] **Step 26.1: Update**

Replace status line with:

```
Status: v0.1.0 GA. Single-user editing, multi-tenant RLS, realtime collaboration (cell-lock + per-recipient masked broadcast), version history, server-side xlsx export, 4-adapter conformance suite, docs site, FastAPI integration example. Ready for npm publish + public GitHub once §11 decisions land (product name / org / domain).
```

- [ ] **Step 26.2: Commit**

```bash
git add README.md
git commit -m "docs: README v0.1.0 GA status"
```

> **🟢 M6 checkpoint — Sprint 4 done; v0.1.0 ready.**

---

## Self-Review

**1. Spec §9 Sprint 4 coverage:**
- ✅ Named version history UI + restore → T9-T13
- ✅ Server-side xlsx export → T14
- ✅ EventAdapter trigger + payload → T2 + T20
- ✅ Docs site (Astro Starlight) → T18-T21
- ✅ EduCube dogfood (FastAPI 3 endpoints + Vue view) → T23
- ✅ LICENSE headers + NOTICE + CHANGELOG → T22 (LICENSE/CONTRIBUTING from Sprint 1)
- ✅ First GitHub release v0.1.0 → T24 + T25 (decision-gated)
- 🔄 **Public Cloudflare Workers demo** → deferred to post-GA; gated on §11 decisions + infra credentials
- ✅ Adapter conformance suite → T15-T17

Sprint 3 carry-over: ✅ demo Redis container (T5), CellLockOverlay (T6/T7), Real-WS Playwright (T8), MaskRuleCache pub/sub (T3).

**2. Placeholder scan**: clean. Cloudflare deferral is explicit. Header script is intentionally opt-in.

**3. Type consistency**:
- `Version` (id/workbookId/name/createdBy/createdAt) consistent across server/core/react/vue.
- `EnsembleEvent` discriminated union via `EmitInput.type` literal.
- `EventEmitter.emit({tenantId, actorId, type, resourceId?, extra?})` consistent across 4 invoking routes.
- LockState shape `Record<string, string>` consistent between React + Vue.

**4. Known gotchas**:
- Astro Starlight version pin (4.16 / 0.28.3) — bump at impl time
- xlsx 0.18.5 locked (newer versions not on public registry)
- FastAPI UI requires user to paste workbook UUID — not auto-bootstrapped
- `release.yml` needs `NPM_TOKEN` + `@ensemble` scope ownership
- Cloudflare Workers demo deploy: R2 + Neon + Upstash credentials needed; deferred

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-16-sprint4-polish-and-ship.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review. 26 tasks across 6 milestones.

**2. Inline Execution** — execute in this session using executing-plans, batch with milestone checkpoints.

**Which approach?**
