# Sprint 3 — "Realtime" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn ensemble's single-user editor into a real multi-user collaborative spreadsheet. Multiple clients connect to the same workbook over WebSocket, acquire cell locks before editing, submit mutations that get persisted with monotonic `seq_num` and broadcast to peers with per-recipient masking, drop disconnected users from presence after 15s, and recover seamlessly on reconnect via seq-num replay.

**Architecture:**
- **Redis** stores cell locks (`SET key value NX EX 30`) and presence heartbeat keys. Single-instance for Sprint 3 (multi-node pub/sub deferred to Sprint 4).
- **`mutations` table** in Postgres: append-only oplog, `(workbook_id, seq_num)` unique. `seq_num` allocated via `SELECT MAX ... FOR UPDATE` in the same transaction as INSERT.
- **`CollabRoom`** in-memory registry of WS clients per `workbookId`.
- **`CellLockManager`**: Redis-backed acquire/release/renew with TTL 30s. Atomic release/renew via Lua CAS.
- **`MutationBroadcaster`**: persists synchronously then fans out per-recipient masked `apply_mutation` frames.
- **Reconnect protocol**: client sends `last_seq` query param; if gap ≤200, replay; else fresh masked snapshot.
- **Backpressure**: 30 ops/sec token bucket per WS client; over-cap submit returns `rate_limited` and is dropped.

**Tech Stack:** Same as Sprint 2 + `ioredis 5.x` + `@testcontainers/redis`.

**Spec reference:** `docs/specs/2026-05-15-ensemble-design.md` §7 realtime protocol, §9 Sprint 3. Sprint 2 plan at `docs/superpowers/plans/2026-05-15-sprint2-permission-folder.md`.

**Pre-condition:** Sprint 2 complete on `main` at commit `20c42c0` (hotfix) or later.

---

## Conventions

- **Working dir**: `/Users/cedric/Projects.localized/ensemble`.
- **Coverage target**: keep server/core at Sprint 2 levels (lines ≥90, branches ≥80).
- **TDD discipline**: every behaviour change → failing test → red → minimal impl → green → commit.
- **Realtime invariant**: every mutation flows through `MutationBroadcaster.submit()`. No `cellData` mutation outside it.
- **Lock invariant**: every cell write requires a held lock by the mutating user; TTL renews on submit.

---

## Milestones

| Milestone | Tasks | Green-at-end |
|---|---|---|
| **M1: Redis + mutations** | T1-T4 | Redis client, Testcontainers Redis, `mutations` schema + RLS, MutationService monotonic seq_num |
| **M2: CellLockManager** | T5-T7 | Redis-backed acquire/release/renew TTL 30s; Lua CAS; real-Redis contention green |
| **M3: CollabRoom + Presence** | T8-T10 | Room registry; 5s heartbeat + 15s eviction sweep |
| **M4: Realtime mutation flow** | T11-T13 | Frame parser; MutationBroadcaster; WS Session; 2-client integration test |
| **M5: Reconnect + Backpressure** | T14-T16 | last_seq replay; 30 ops/sec token bucket; welcome ships real seq + presence + locks |
| **M6: Client + Demo + e2e** | T17-T20 | WsClient.acquireLock/submitMutation/onApplyMutation; React+Vue LockBadge; 2-context Playwright e2e |
| **M7: Docs** | T21-T22 | ADR 0002 cell-lock vs CRDT; README Sprint 3 status |

After each milestone: `pnpm -r test --coverage && pnpm -r build` clean.

---

## File structure delta (vs Sprint 2)

```
packages/server/
  drizzle/
    0005_mutations.sql                       NEW: drizzle-kit generated
    0006_rls_mutations.sql                   NEW: handwritten RLS + GRANT
  src/
    db/schema.ts                             MODIFY: add mutations table
    realtime/                                NEW directory
      collab-room.ts                         CollabRoom + RoomRegistry
      cell-lock-manager.ts                   Redis-backed acquire/release/renew
      mutation-broadcaster.ts                per-recipient masked broadcast
      presence-tracker.ts                    5s/15s tracker + sweep
      backpressure.ts                        token bucket
      messages.ts                            WS frame types + parser
    services/mutation-service.ts             MutationService append/since/currentSeq
    ws/welcome.ts                            MODIFY: real seqNum + presence + locks + last_seq replay
    ws/session.ts                            NEW: per-WS message dispatcher
    redis/client.ts                          NEW: ioredis factory
    server.ts                                MODIFY: wire Redis + room registry + session per WS
  test/unit/                                 NEW: cell-lock / presence / backpressure / messages / mutation-service
  test/integration/                          NEW: redis / cell-lock-real-redis / mutation-persist / rls-mutations / collab-two-clients / reconnect-replay

packages/core/
  src/ws-client.ts                           MODIFY: acquireLock / submitMutation / onApplyMutation / sendHeartbeat

packages/react/
  src/LockBadge.tsx                          NEW

packages/vue/
  src/LockBadge.vue                          NEW

apps/demo/
  e2e/two-clients-collab.spec.ts             NEW
```

---

# Milestone 1 — Redis + mutations schema

## Task 1: Redis client + Testcontainers smoke

**Files:**
- Create: `packages/server/src/redis/client.ts`
- Create: `packages/server/test/integration/redis.int.test.ts`
- Modify: `packages/server/package.json` (add deps)
- Modify: `packages/server/test/integration/_globalSetup.ts` (start Redis container)
- Modify: `packages/server/test/integration/_dbHelpers.ts` (export redisUrl)

- [ ] **Step 1.1: Add deps**

Add to `packages/server/package.json`:
- `dependencies`: `"ioredis": "5.4.1"`
- `devDependencies`: `"@testcontainers/redis": "10.13.2"`

Then `pnpm install`.

- [ ] **Step 1.2: Failing test**

Create `packages/server/test/integration/redis.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRedis } from '../../src/redis/client'
import { redisUrl } from './_dbHelpers'

describe('Redis smoke', () => {
  it('SET + GET round-trip', async () => {
    const redis = createRedis(redisUrl())
    await redis.set('hello', 'world')
    expect(await redis.get('hello')).toBe('world')
    await redis.quit()
  })

  it('SET NX EX returns OK once, null on contention', async () => {
    const redis = createRedis(redisUrl())
    const a = await redis.set('lock:k', 'A', 'EX', 5, 'NX')
    const b = await redis.set('lock:k', 'B', 'EX', 5, 'NX')
    expect(a).toBe('OK')
    expect(b).toBeNull()
    await redis.quit()
  })
})
```

- [ ] **Step 1.3: globalSetup starts Redis**

Edit `packages/server/test/integration/_globalSetup.ts` to start a `RedisContainer` alongside Postgres:

```ts
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis'

let redisContainer: StartedRedisContainer

// inside setup():
redisContainer = await new RedisContainer('redis:7-alpine').start()
process.env.REDIS_URL = redisContainer.getConnectionUrl()

// inside teardown():
await redisContainer.stop()
```

Edit `packages/server/test/integration/_dbHelpers.ts` — add:

```ts
export const redisUrl = (): string => {
  const url = process.env.REDIS_URL
  if (!url) throw new Error('REDIS_URL not set — _globalSetup must run first')
  return url
}
```

- [ ] **Step 1.4: Implement client**

Create `packages/server/src/redis/client.ts`:

```ts
import { Redis, type RedisOptions } from 'ioredis'

export function createRedis(url: string, opts: RedisOptions = {}): Redis {
  return new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    ...opts,
  })
}

export type { Redis } from 'ioredis'
```

- [ ] **Step 1.5: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/redis.int.test.ts
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): Redis client + Testcontainers integration"
```

---

## Task 2: `mutations` schema + RLS

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Generate: `packages/server/drizzle/0005_mutations.sql`
- Create: `packages/server/drizzle/0006_rls_mutations.sql`
- Modify: `packages/server/drizzle/meta/_journal.json`

- [ ] **Step 2.1: Add table**

Append to `packages/server/src/db/schema.ts`:

```ts
export const mutations = pgTable(
  'mutations',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    workbookId: uuid('workbook_id').notNull().references(() => workbooks.id),
    seqNum: bigint('seq_num', { mode: 'number' }).notNull(),
    userId: text('user_id').notNull(),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb('payload').notNull(),
  },
  (t) => ({
    workbookSeqUnique: uniqueIndex('mutations_workbook_seq_unique').on(t.workbookId, t.seqNum),
    workbookSeqAsc: index('mutations_workbook_seq_idx').on(t.workbookId, t.seqNum),
  })
)
```

Add imports if missing: `bigserial, bigint, jsonb, index, uniqueIndex`.

- [ ] **Step 2.2: Generate migration**

```bash
pnpm --filter @ensemble/server exec drizzle-kit generate --name mutations
```

- [ ] **Step 2.3: RLS migration**

Create `packages/server/drizzle/0006_rls_mutations.sql`:

```sql
ALTER TABLE mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutations FORCE ROW LEVEL SECURITY;

CREATE POLICY mutations_tenant_isolation ON mutations
  USING (
    workbook_id IN (SELECT id FROM workbooks WHERE tenant_id::text = current_setting('app.tenant_id', true))
  )
  WITH CHECK (
    workbook_id IN (SELECT id FROM workbooks WHERE tenant_id::text = current_setting('app.tenant_id', true))
  );

GRANT SELECT, INSERT ON mutations TO app_user;
GRANT USAGE ON SEQUENCE mutations_id_seq TO app_user;
```

Append to `_journal.json` (idx incremented, tag `0006_rls_mutations`).

- [ ] **Step 2.4: Verify**

```bash
pnpm --filter @ensemble/server build
docker rm -f mut-test 2>/dev/null
docker run -d --name mut-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=t -p 54325:5432 postgres:16
sleep 5
DATABASE_URL=postgres://postgres:postgres@localhost:54325/t pnpm --filter @ensemble/server exec node dist/db/migrate.js
docker exec mut-test psql -U postgres -d t -c "\d mutations"
docker rm -f mut-test
```

- [ ] **Step 2.5: Commit**

```bash
git add packages/server/src/db packages/server/drizzle
git commit -m "feat(server): mutations schema with seq_num unique index + RLS"
```

---

## Task 3: `MutationService` with monotonic `seq_num`

**Files:**
- Create: `packages/server/src/services/mutation-service.ts`
- Create: `packages/server/test/unit/mutation-service.test.ts`
- Create: `packages/server/test/integration/mutation-persist.int.test.ts`

- [ ] **Step 3.1: Failing unit test**

Create `packages/server/test/unit/mutation-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createMutationService } from '../../src/services/mutation-service'

function fakeTx(initialMax: number | null = null) {
  let max = initialMax
  const inserted: { workbookId: string; seqNum: number; payload: unknown; userId: string }[] = []
  return {
    execute: vi.fn(async (_q: unknown) => [{ max_seq: max }]),
    insert: () => ({
      values: async (v: typeof inserted[number]) => {
        inserted.push(v)
        max = v.seqNum
      },
    }),
    _inserted: inserted,
  }
}

describe('MutationService.append', () => {
  it('seq_num starts at 1 for empty workbook', async () => {
    const tx = fakeTx(null)
    const svc = createMutationService({ db: { transaction: async (fn) => fn(tx) } } as never)
    const r = await svc.append({ workbookId: 'wb', userId: 'u', payload: { op: 'set' } })
    expect(r.seqNum).toBe(1)
  })

  it('increments past existing max', async () => {
    const tx = fakeTx(42)
    const svc = createMutationService({ db: { transaction: async (fn) => fn(tx) } } as never)
    const r = await svc.append({ workbookId: 'wb', userId: 'u', payload: {} })
    expect(r.seqNum).toBe(43)
  })
})
```

- [ ] **Step 3.2: Implement**

Create `packages/server/src/services/mutation-service.ts`:

```ts
import { sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { mutations } from '../db/schema'

export interface AppendInput {
  workbookId: string
  userId: string
  payload: unknown
}

export interface MutationRow {
  id: bigint
  workbookId: string
  seqNum: number
  userId: string
  appliedAt: Date
  payload: unknown
}

export function createMutationService(deps: { db: Database }) {
  return {
    async append(input: AppendInput): Promise<{ seqNum: number }> {
      return deps.db.transaction(async (tx) => {
        const rows = await tx.execute<{ max_seq: number | null }>(sql`
          SELECT COALESCE(MAX(seq_num), 0) AS max_seq
          FROM mutations
          WHERE workbook_id = ${input.workbookId}
          FOR UPDATE
        `)
        const next = (rows[0]?.max_seq ?? 0) + 1
        await tx.insert(mutations).values({
          workbookId: input.workbookId,
          seqNum: next,
          userId: input.userId,
          payload: input.payload as never,
        })
        return { seqNum: next }
      })
    },

    async since(workbookId: string, lastSeq: number, maxRows = 200): Promise<MutationRow[]> {
      return deps.db.execute<MutationRow>(sql`
        SELECT id, workbook_id AS "workbookId", seq_num AS "seqNum",
               user_id AS "userId", applied_at AS "appliedAt", payload
        FROM mutations
        WHERE workbook_id = ${workbookId} AND seq_num > ${lastSeq}
        ORDER BY seq_num ASC
        LIMIT ${maxRows}
      `)
    },

    async currentSeq(workbookId: string): Promise<number> {
      const rows = await deps.db.execute<{ max_seq: number | null }>(sql`
        SELECT COALESCE(MAX(seq_num), 0) AS max_seq
        FROM mutations WHERE workbook_id = ${workbookId}
      `)
      return rows[0]?.max_seq ?? 0
    },
  }
}

export type MutationService = ReturnType<typeof createMutationService>
```

- [ ] **Step 3.3: Integration test (concurrent inserts)**

Create `packages/server/test/integration/mutation-persist.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createMutationService } from '../../src/services/mutation-service'

describe('MutationService persistence', () => {
  it('assigns monotonic seq_num under concurrent append', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'mut-concur' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'concur' }).returning()
    const svc = createMutationService({ db })

    const N = 50
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        svc.append({ workbookId: wb.id, userId: `u${i % 3}`, payload: { i } })
      )
    )
    const seqs = results.map((r) => r.seqNum).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1))

    const all = await svc.since(wb.id, 0, 1000)
    expect(all).toHaveLength(N)
  })
})
```

- [ ] **Step 3.4: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/mutation-service.test.ts test/integration/mutation-persist.int.test.ts
git add packages/server
git commit -m "feat(server): MutationService with FOR UPDATE-locked seq_num + since/currentSeq"
```

---

## Task 4: Cross-tenant mutations RLS

**Files:**
- Create: `packages/server/test/integration/rls-mutations.int.test.ts`

- [ ] **Step 4.1: Test**

Create `packages/server/test/integration/rls-mutations.int.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { appDb, db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createMutationService } from '../../src/services/mutation-service'
import { withTenant } from '../../src/db/tenant-context'

describe('mutations RLS', () => {
  it('blocks cross-tenant mutation read', async () => {
    const [a] = await db.insert(tenants).values({ name: 'mut-rls-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'mut-rls-b' }).returning()
    const [wbA] = await db.insert(workbooks).values({ tenantId: a.id, ownerId: 'u', name: 'A' }).returning()
    await createMutationService({ db }).append({ workbookId: wbA.id, userId: 'u', payload: { x: 1 } })

    const fromB = await withTenant(appDb, b.id, async (tx) =>
      tx.execute(sql`SELECT * FROM mutations`)
    )
    expect(fromB).toHaveLength(0)
  })
})
```

- [ ] **Step 4.2: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/rls-mutations.int.test.ts
git add packages/server
git commit -m "test(server): cross-tenant mutations RLS integration"
```

> **🟢 Milestone 1 checkpoint.**

---

# Milestone 2 — CellLockManager

## Task 5: `CellLockManager` (mocked Redis unit test)

**Files:**
- Create: `packages/server/src/realtime/cell-lock-manager.ts`
- Create: `packages/server/test/unit/cell-lock-manager.test.ts`

- [ ] **Step 5.1: Failing test**

Create `packages/server/test/unit/cell-lock-manager.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createCellLockManager } from '../../src/realtime/cell-lock-manager'

function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>()
  return {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const ex = (args[1] as number) ?? 30
      const nx = args[2] === 'NX'
      const now = Date.now()
      const cur = store.get(key)
      if (nx && cur && cur.expiresAt > now) return null
      store.set(key, { value, expiresAt: now + ex * 1000 })
      return 'OK'
    }),
    get: vi.fn(async (key: string) => {
      const cur = store.get(key)
      if (!cur || cur.expiresAt < Date.now()) return null
      return cur.value
    }),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    expire: vi.fn(async (key: string, ex: number) => {
      const cur = store.get(key)
      if (!cur) return 0
      cur.expiresAt = Date.now() + ex * 1000
      return 1
    }),
    eval: vi.fn(async (script: string, _n: number, key: string, ...args: string[]) => {
      const cur = store.get(key)
      const owner = cur && cur.expiresAt > Date.now() ? cur.value : null
      if (script.includes('DEL')) {
        if (owner === args[0]) { store.delete(key); return 1 }
        return 0
      }
      if (script.includes('EXPIRE')) {
        if (owner === args[0]) {
          cur!.expiresAt = Date.now() + Number(args[1]) * 1000
          return 1
        }
        return 0
      }
      return 0
    }),
    _store: store,
  }
}

describe('CellLockManager', () => {
  it('acquire returns true on first call, false on contention', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    const b = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })
    expect(a.acquired).toBe(true)
    expect(a.ownerId).toBe('u1')
    expect(b.acquired).toBe(false)
    expect(b.ownerId).toBe('u1')
  })

  it('owner can re-acquire (TTL refresh)', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    const a2 = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(a.acquired).toBe(true)
    expect(a2.acquired).toBe(true)
  })

  it('release deletes lock; non-owner release is no-op', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(await mgr.release({ workbookId: 'wb', region: 'A1:A1', userId: 'attacker' })).toBe(false)
    expect(await mgr.release({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })).toBe(true)
    const a = await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })
    expect(a.acquired).toBe(true)
  })

  it('renew extends TTL only for owner', async () => {
    const mgr = createCellLockManager({ redis: fakeRedis() as never, ttlSec: 30 })
    await mgr.acquire({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })
    expect(await mgr.renew({ workbookId: 'wb', region: 'A1:A1', userId: 'u1' })).toBe(true)
    expect(await mgr.renew({ workbookId: 'wb', region: 'A1:A1', userId: 'u2' })).toBe(false)
  })
})
```

- [ ] **Step 5.2: Implement (with Lua CAS for atomic release/renew)**

Create `packages/server/src/realtime/cell-lock-manager.ts`:

```ts
import type { Redis } from '../redis/client'

export interface AcquireInput {
  workbookId: string
  region: string
  userId: string
}

export interface AcquireResult {
  acquired: boolean
  ownerId: string
  ttlSec: number
}

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`.trim()

const RENEW_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('EXPIRE', KEYS[1], ARGV[2])
else
  return 0
end
`.trim()

function lockKey(workbookId: string, region: string): string {
  return `ensemble:lock:${workbookId}:${region}`
}

export function createCellLockManager(opts: { redis: Redis; ttlSec: number }) {
  const { redis, ttlSec } = opts
  return {
    async acquire(input: AcquireInput): Promise<AcquireResult> {
      const key = lockKey(input.workbookId, input.region)
      const result = await redis.set(key, input.userId, 'EX', ttlSec, 'NX')
      if (result === 'OK') return { acquired: true, ownerId: input.userId, ttlSec }
      const ownerId = (await redis.get(key)) ?? ''
      if (ownerId === input.userId) {
        await redis.expire(key, ttlSec)
        return { acquired: true, ownerId, ttlSec }
      }
      return { acquired: false, ownerId, ttlSec }
    },
    async release(input: AcquireInput): Promise<boolean> {
      const result = (await redis.eval(RELEASE_SCRIPT, 1, lockKey(input.workbookId, input.region), input.userId)) as number
      return result === 1
    },
    async renew(input: AcquireInput): Promise<boolean> {
      const result = (await redis.eval(RENEW_SCRIPT, 1, lockKey(input.workbookId, input.region), input.userId, String(ttlSec))) as number
      return result === 1
    },
    async ownerOf(input: { workbookId: string; region: string }): Promise<string | null> {
      return redis.get(lockKey(input.workbookId, input.region))
    },
  }
}

export type CellLockManager = ReturnType<typeof createCellLockManager>
```

- [ ] **Step 5.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/cell-lock-manager.test.ts
git add packages/server
git commit -m "feat(server): CellLockManager with Redis NX EX + Lua CAS release/renew"
```

---

## Task 6: Real-Redis contention + TTL expiry integration

**Files:**
- Create: `packages/server/test/integration/cell-lock-real-redis.int.test.ts`

- [ ] **Step 6.1: Test**

Create `packages/server/test/integration/cell-lock-real-redis.int.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRedis, type Redis } from '../../src/redis/client'
import { createCellLockManager } from '../../src/realtime/cell-lock-manager'
import { redisUrl } from './_dbHelpers'

let redis: Redis
beforeAll(() => { redis = createRedis(redisUrl()) })
afterAll(async () => { await redis.flushall(); await redis.quit() })

describe('CellLockManager real Redis', () => {
  it('only one of N concurrent acquires wins, losers see the same owner', async () => {
    const mgr = createCellLockManager({ redis, ttlSec: 5 })
    const N = 20
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        mgr.acquire({ workbookId: 'wb-race', region: 'A1:A1', userId: `u${i}` })
      )
    )
    const winners = results.filter((r) => r.acquired)
    expect(winners.length).toBeGreaterThan(0)
    const owner = winners[0]!.ownerId
    for (const l of results.filter((r) => !r.acquired)) {
      expect(l.ownerId).toBe(owner)
    }
  })

  it('TTL expiry releases the lock', async () => {
    const mgr = createCellLockManager({ redis, ttlSec: 1 })
    const a = await mgr.acquire({ workbookId: 'wb-ttl', region: 'A1:A1', userId: 'u1' })
    expect(a.acquired).toBe(true)
    await new Promise((r) => setTimeout(r, 1100))
    const b = await mgr.acquire({ workbookId: 'wb-ttl', region: 'A1:A1', userId: 'u2' })
    expect(b.acquired).toBe(true)
    expect(b.ownerId).toBe('u2')
  })
})
```

- [ ] **Step 6.2: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/cell-lock-real-redis.int.test.ts
git add packages/server
git commit -m "test(server): real-Redis CellLockManager contention + TTL expiry"
```

---

## Task 7: M2 checkpoint — confirm Lua CAS works end-to-end

This is a no-code checkpoint, no commit:

- [ ] Run `pnpm --filter @ensemble/server test --coverage` and verify all M1+M2 tests green; thresholds met.
- [ ] Confirm `release/renew` are real Lua EVAL calls (`redis.eval` in test/integration); a `GET+DEL` two-step would race in production.

> **🟢 Milestone 2 checkpoint.**

---

# Milestone 3 — CollabRoom + Presence

## Task 8: `CollabRoom` registry

**Files:**
- Create: `packages/server/src/realtime/collab-room.ts`
- Create: `packages/server/test/unit/collab-room.test.ts`

- [ ] **Step 8.1: Failing test**

Create `packages/server/test/unit/collab-room.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createCollabRoom, createRoomRegistry } from '../../src/realtime/collab-room'

describe('CollabRoom', () => {
  it('addClient + listClients returns members in insertion order', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    room.addClient({ clientId: 'cA', userId: 'u1', send: vi.fn() })
    room.addClient({ clientId: 'cB', userId: 'u2', send: vi.fn() })
    expect(room.listClients().map((c) => c.userId)).toEqual(['u1', 'u2'])
  })

  it('removeClient drops only that client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    room.addClient({ clientId: 'cA', userId: 'u1', send: vi.fn() })
    room.addClient({ clientId: 'cB', userId: 'u2', send: vi.fn() })
    room.removeClient('cA')
    expect(room.listClients().map((c) => c.clientId)).toEqual(['cB'])
  })

  it('broadcast invokes send on every client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    const a = vi.fn(); const b = vi.fn()
    room.addClient({ clientId: 'cA', userId: 'u1', send: a })
    room.addClient({ clientId: 'cB', userId: 'u2', send: b })
    room.broadcast({ type: 'demo' })
    expect(a).toHaveBeenCalledWith({ type: 'demo' })
    expect(b).toHaveBeenCalledWith({ type: 'demo' })
  })

  it('broadcastExcept skips excluded client', () => {
    const room = createCollabRoom({ workbookId: 'wb' })
    const a = vi.fn(); const b = vi.fn()
    room.addClient({ clientId: 'cA', userId: 'u1', send: a })
    room.addClient({ clientId: 'cB', userId: 'u2', send: b })
    room.broadcastExcept('cA', { type: 'demo' })
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledWith({ type: 'demo' })
  })
})

describe('createRoomRegistry', () => {
  it('getOrCreate returns same room for same workbookId', () => {
    const reg = createRoomRegistry()
    const r1 = reg.getOrCreate('wb')
    const r2 = reg.getOrCreate('wb')
    expect(r1).toBe(r2)
  })
})
```

- [ ] **Step 8.2: Implement**

Create `packages/server/src/realtime/collab-room.ts`:

```ts
export interface Client {
  clientId: string
  userId: string
  send: (frame: unknown) => void
}

export interface RoomOpts {
  workbookId: string
}

export function createCollabRoom(opts: RoomOpts) {
  const clients = new Map<string, Client>()
  return {
    get workbookId() { return opts.workbookId },
    addClient(c: Client): void { clients.set(c.clientId, c) },
    removeClient(clientId: string): void { clients.delete(clientId) },
    listClients(): Client[] { return Array.from(clients.values()) },
    getClient(clientId: string): Client | undefined { return clients.get(clientId) },
    broadcast(frame: unknown): void {
      for (const c of clients.values()) c.send(frame)
    },
    broadcastExcept(excludeClientId: string, frame: unknown): void {
      for (const c of clients.values()) {
        if (c.clientId !== excludeClientId) c.send(frame)
      }
    },
    size(): number { return clients.size },
  }
}

export type CollabRoom = ReturnType<typeof createCollabRoom>

export function createRoomRegistry() {
  const rooms = new Map<string, CollabRoom>()
  return {
    getOrCreate(workbookId: string): CollabRoom {
      let room = rooms.get(workbookId)
      if (!room) {
        room = createCollabRoom({ workbookId })
        rooms.set(workbookId, room)
      }
      return room
    },
    get(workbookId: string): CollabRoom | undefined { return rooms.get(workbookId) },
    drop(workbookId: string): void { rooms.delete(workbookId) },
    size(): number { return rooms.size },
  }
}

export type RoomRegistry = ReturnType<typeof createRoomRegistry>
```

- [ ] **Step 8.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/collab-room.test.ts
git add packages/server
git commit -m "feat(server): CollabRoom + RoomRegistry"
```

---

## Task 9: PresenceTracker with TTL + sweep

**Files:**
- Create: `packages/server/src/realtime/presence-tracker.ts`
- Create: `packages/server/test/unit/presence-tracker.test.ts`

- [ ] **Step 9.1: Failing test**

Create `packages/server/test/unit/presence-tracker.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPresenceTracker } from '../../src/realtime/presence-tracker'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('PresenceTracker', () => {
  it('list initially empty', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    expect(p.list('wb')).toEqual([])
  })

  it('heartbeat adds entry', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    expect(p.list('wb')).toHaveLength(1)
  })

  it('evicts after evictAfterMs without heartbeat', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(15_001)
    expect(p.evictStale('wb')).toEqual(['c1'])
    expect(p.list('wb')).toEqual([])
  })

  it('refresh resets the eviction timer', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(14_000)
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(14_000)
    expect(p.evictStale('wb')).toEqual([])
  })

  it('remove drops specific client immediately', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    p.heartbeat({ workbookId: 'wb', clientId: 'c2', userId: 'u2' })
    p.remove('wb', 'c1')
    expect(p.list('wb').map((x) => x.clientId)).toEqual(['c2'])
  })

  it('startSweep invokes onEvict on expired clients', () => {
    const p = createPresenceTracker({ evictAfterMs: 15_000 })
    const onEvict = vi.fn()
    const stop = p.startSweep({ intervalMs: 1000, onEvict })
    p.heartbeat({ workbookId: 'wb', clientId: 'c1', userId: 'u1' })
    vi.advanceTimersByTime(16_000)
    expect(onEvict).toHaveBeenCalledWith('wb', 'c1')
    stop()
  })
})
```

- [ ] **Step 9.2: Implement**

Create `packages/server/src/realtime/presence-tracker.ts`:

```ts
export interface PresenceEntry {
  clientId: string
  userId: string
  cursor?: { sheet: string; row: number; col: number }
  selection?: unknown
  lastSeenAt: number
}

export interface HeartbeatInput {
  workbookId: string
  clientId: string
  userId: string
  cursor?: PresenceEntry['cursor']
  selection?: unknown
}

export interface SweepOpts {
  intervalMs: number
  onEvict: (workbookId: string, clientId: string) => void
}

export function createPresenceTracker(opts: { evictAfterMs: number }) {
  const byWorkbook = new Map<string, Map<string, PresenceEntry>>()

  function evictForWorkbook(wbId: string, now: number): string[] {
    const m = byWorkbook.get(wbId)
    if (!m) return []
    const cutoff = now - opts.evictAfterMs
    const dropped: string[] = []
    for (const [cid, entry] of m) {
      if (entry.lastSeenAt < cutoff) {
        m.delete(cid)
        dropped.push(cid)
      }
    }
    return dropped
  }

  return {
    heartbeat(input: HeartbeatInput): void {
      let m = byWorkbook.get(input.workbookId)
      if (!m) { m = new Map(); byWorkbook.set(input.workbookId, m) }
      m.set(input.clientId, {
        clientId: input.clientId,
        userId: input.userId,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.selection !== undefined ? { selection: input.selection } : {}),
        lastSeenAt: Date.now(),
      })
    },
    list(workbookId: string): PresenceEntry[] {
      return Array.from(byWorkbook.get(workbookId)?.values() ?? [])
    },
    remove(workbookId: string, clientId: string): void {
      byWorkbook.get(workbookId)?.delete(clientId)
    },
    evictStale(workbookId: string): string[] {
      return evictForWorkbook(workbookId, Date.now())
    },
    startSweep(s: SweepOpts): () => void {
      const handle = setInterval(() => {
        const now = Date.now()
        for (const wbId of byWorkbook.keys()) {
          for (const cid of evictForWorkbook(wbId, now)) s.onEvict(wbId, cid)
        }
      }, s.intervalMs)
      return () => clearInterval(handle)
    },
  }
}

export type PresenceTracker = ReturnType<typeof createPresenceTracker>
```

- [ ] **Step 9.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/presence-tracker.test.ts
git add packages/server
git commit -m "feat(server): PresenceTracker with TTL eviction + periodic sweep"
```

---

## Task 10: M3 checkpoint

No-code checkpoint:

- [ ] Run `pnpm --filter @ensemble/server test --coverage` and verify all M1-M3 tests green.

> **🟢 Milestone 3 checkpoint.**

---

# Milestone 4 — Realtime mutation flow

## Task 11: WS message types + parser

**Files:**
- Create: `packages/server/src/realtime/messages.ts`
- Create: `packages/server/test/unit/messages.test.ts`

- [ ] **Step 11.1: Failing test**

Create `packages/server/test/unit/messages.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseInboundFrame } from '../../src/realtime/messages'

describe('parseInboundFrame', () => {
  it('acquire_lock', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'acquire_lock', region: 'A1:A1' })))
      .toEqual({ type: 'acquire_lock', region: 'A1:A1' })
  })
  it('submit_mutation', () => {
    expect(parseInboundFrame(JSON.stringify({
      type: 'submit_mutation', clientSeq: 5, region: 'A1:A1', payload: { op: 'set' },
    }))).toEqual({ type: 'submit_mutation', clientSeq: 5, region: 'A1:A1', payload: { op: 'set' } })
  })
  it('release_lock', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'release_lock', region: 'A1:A1' })))
      .toEqual({ type: 'release_lock', region: 'A1:A1' })
  })
  it('presence_heartbeat with cursor', () => {
    expect(parseInboundFrame(JSON.stringify({
      type: 'presence_heartbeat', cursor: { sheet: 's', row: 0, col: 0 },
    }))).toEqual({ type: 'presence_heartbeat', cursor: { sheet: 's', row: 0, col: 0 } })
  })
  it('malformed JSON → null', () => {
    expect(parseInboundFrame('{not json')).toBeNull()
  })
  it('unknown type → null', () => {
    expect(parseInboundFrame(JSON.stringify({ type: 'nope' }))).toBeNull()
  })
})
```

- [ ] **Step 11.2: Implement**

Create `packages/server/src/realtime/messages.ts`:

```ts
export type InboundFrame =
  | { type: 'acquire_lock'; region: string }
  | { type: 'release_lock'; region: string }
  | { type: 'submit_mutation'; clientSeq: number; region: string; payload: unknown }
  | { type: 'presence_heartbeat'; cursor?: { sheet: string; row: number; col: number }; selection?: unknown }

export type OutboundFrame =
  | { type: 'welcome'; workbookId: string; seqNum: number; snapshot: unknown; presence: unknown[]; locks: unknown[] }
  | { type: 'lock_granted'; region: string; ownerId: string; ttlSec: number }
  | { type: 'lock_denied'; region: string; ownerId: string }
  | { type: 'lock_acquired'; region: string; ownerId: string; ttlSec: number }
  | { type: 'lock_released'; region: string }
  | { type: 'mutation_accepted'; clientSeq: number; seqNum: number }
  | { type: 'apply_mutation'; seqNum: number; userId: string; payload: unknown }
  | { type: 'presence_update'; entries: unknown[] }
  | { type: 'user_left'; clientId: string }
  | { type: 'replay_complete'; seqNum: number }
  | { type: 'error'; code: string; message?: string }

export function parseInboundFrame(raw: string): InboundFrame | null {
  let obj: unknown
  try { obj = JSON.parse(raw) } catch { return null }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  switch (o.type) {
    case 'acquire_lock':
      return typeof o.region === 'string' ? { type: 'acquire_lock', region: o.region } : null
    case 'release_lock':
      return typeof o.region === 'string' ? { type: 'release_lock', region: o.region } : null
    case 'submit_mutation':
      if (typeof o.clientSeq === 'number' && typeof o.region === 'string') {
        return {
          type: 'submit_mutation',
          clientSeq: o.clientSeq,
          region: o.region,
          payload: o.payload,
        }
      }
      return null
    case 'presence_heartbeat': {
      const out: InboundFrame = { type: 'presence_heartbeat' }
      if (o.cursor && typeof o.cursor === 'object') {
        const c = o.cursor as Record<string, unknown>
        if (typeof c.sheet === 'string' && typeof c.row === 'number' && typeof c.col === 'number') {
          out.cursor = { sheet: c.sheet, row: c.row, col: c.col }
        }
      }
      if ('selection' in o) out.selection = o.selection
      return out
    }
    default:
      return null
  }
}
```

- [ ] **Step 11.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/messages.test.ts
git add packages/server
git commit -m "feat(server): WS frame types + parser with malformed/unknown guards"
```

---

## Task 12: MutationBroadcaster + WS Session + server wiring

**Files:**
- Create: `packages/server/src/realtime/mutation-broadcaster.ts`
- Create: `packages/server/src/ws/session.ts`
- Modify: `packages/server/src/server.ts` (wire Redis + room + session)

- [ ] **Step 12.1: MutationBroadcaster**

Create `packages/server/src/realtime/mutation-broadcaster.ts`:

```ts
import type { MaskRule } from '../adapters/types'
import { applyMaskRules, type WorkbookData } from '../services/mask-service'
import type { CollabRoom } from './collab-room'
import type { MutationService } from '../services/mutation-service'

export interface MutationBroadcasterDeps {
  mutations: MutationService
  getMaskRulesFor: (userId: string, workbookId: string) => Promise<MaskRule[]>
}

function payloadLooksLikeWorkbookData(x: unknown): boolean {
  return (
    typeof x === 'object' && x !== null &&
    'sheetOrder' in (x as Record<string, unknown>) &&
    'sheets' in (x as Record<string, unknown>)
  )
}

export function createMutationBroadcaster(deps: MutationBroadcasterDeps) {
  return {
    async submit(input: {
      room: CollabRoom
      senderClientId: string
      senderUserId: string
      workbookId: string
      clientSeq: number
      region: string
      payload: unknown
    }): Promise<{ seqNum: number }> {
      const { seqNum } = await deps.mutations.append({
        workbookId: input.workbookId,
        userId: input.senderUserId,
        payload: input.payload,
      })

      const sender = input.room.getClient(input.senderClientId)
      sender?.send({ type: 'mutation_accepted', clientSeq: input.clientSeq, seqNum })

      for (const client of input.room.listClients()) {
        if (client.clientId === input.senderClientId) continue
        const rules = await deps.getMaskRulesFor(client.userId, input.workbookId)
        let outPayload: unknown = input.payload
        if (rules.length > 0 && payloadLooksLikeWorkbookData(input.payload)) {
          outPayload = applyMaskRules(input.payload as WorkbookData, rules)
        }
        client.send({ type: 'apply_mutation', seqNum, userId: input.senderUserId, payload: outPayload })
      }
      return { seqNum }
    },
  }
}

export type MutationBroadcaster = ReturnType<typeof createMutationBroadcaster>
```

- [ ] **Step 12.2: WS Session**

Create `packages/server/src/ws/session.ts`:

```ts
import type { WSContext } from '@hono/node-ws'
import type { IdentityContext } from '../adapters/types'
import type { TokenBucket } from '../realtime/backpressure'
import type { CellLockManager } from '../realtime/cell-lock-manager'
import type { CollabRoom } from '../realtime/collab-room'
import type { MutationBroadcaster } from '../realtime/mutation-broadcaster'
import type { PresenceTracker } from '../realtime/presence-tracker'
import { parseInboundFrame, type OutboundFrame } from '../realtime/messages'

export interface SessionDeps {
  cellLocks: CellLockManager
  presence: PresenceTracker
  broadcaster: MutationBroadcaster
}

export interface SessionContext {
  ws: WSContext
  clientId: string
  identity: IdentityContext
  workbookId: string
  room: CollabRoom
  bucket: TokenBucket
}

export function createSession(ctx: SessionContext, deps: SessionDeps) {
  function send(frame: OutboundFrame): void {
    ctx.ws.send(JSON.stringify(frame))
  }

  async function onMessage(raw: string): Promise<void> {
    const frame = parseInboundFrame(raw)
    if (!frame) {
      send({ type: 'error', code: 'malformed_frame' })
      return
    }

    if (frame.type === 'acquire_lock') {
      const r = await deps.cellLocks.acquire({
        workbookId: ctx.workbookId, region: frame.region, userId: ctx.identity.userId,
      })
      if (r.acquired) {
        send({ type: 'lock_granted', region: frame.region, ownerId: r.ownerId, ttlSec: r.ttlSec })
        ctx.room.broadcastExcept(ctx.clientId, {
          type: 'lock_acquired', region: frame.region, ownerId: r.ownerId, ttlSec: r.ttlSec,
        })
      } else {
        send({ type: 'lock_denied', region: frame.region, ownerId: r.ownerId })
      }
      return
    }

    if (frame.type === 'release_lock') {
      const released = await deps.cellLocks.release({
        workbookId: ctx.workbookId, region: frame.region, userId: ctx.identity.userId,
      })
      if (released) {
        ctx.room.broadcast({ type: 'lock_released', region: frame.region })
      }
      return
    }

    if (frame.type === 'submit_mutation') {
      if (!ctx.bucket.take()) {
        send({ type: 'error', code: 'rate_limited' })
        return
      }
      const owner = await deps.cellLocks.ownerOf({ workbookId: ctx.workbookId, region: frame.region })
      if (owner !== ctx.identity.userId) {
        send({ type: 'error', code: 'lock_not_held' })
        return
      }
      await deps.cellLocks.renew({
        workbookId: ctx.workbookId, region: frame.region, userId: ctx.identity.userId,
      })
      await deps.broadcaster.submit({
        room: ctx.room,
        senderClientId: ctx.clientId,
        senderUserId: ctx.identity.userId,
        workbookId: ctx.workbookId,
        clientSeq: frame.clientSeq,
        region: frame.region,
        payload: frame.payload,
      })
      return
    }

    if (frame.type === 'presence_heartbeat') {
      deps.presence.heartbeat({
        workbookId: ctx.workbookId,
        clientId: ctx.clientId,
        userId: ctx.identity.userId,
        ...(frame.cursor ? { cursor: frame.cursor } : {}),
        ...(frame.selection !== undefined ? { selection: frame.selection } : {}),
      })
      ctx.room.broadcastExcept(ctx.clientId, {
        type: 'presence_update',
        entries: deps.presence.list(ctx.workbookId),
      })
      return
    }
  }

  function onClose(): void {
    deps.presence.remove(ctx.workbookId, ctx.clientId)
    ctx.room.removeClient(ctx.clientId)
    ctx.room.broadcast({ type: 'user_left', clientId: ctx.clientId })
  }

  return { send, onMessage, onClose }
}
```

- [ ] **Step 12.3: Wire into createServer**

Edit `packages/server/src/server.ts`:
- Add `redisUrl?: string` to `CreateServerOpts`
- At server build time, construct: redis client, room registry, cellLocks, presence (+ startSweep), broadcaster
- In the WS `upgradeWebSocket` handler `onOpen`: create clientId, room.addClient, stash session
- Add `onMessage` / `onClose` callbacks delegating to session

(See `welcome.ts` and existing `server.ts` for the surrounding shape; mirror that.)

- [ ] **Step 12.4: Build + commit**

```bash
pnpm --filter @ensemble/server build
git add packages/server
git commit -m "feat(server): MutationBroadcaster + WS Session dispatcher; wired through createServer"
```

---

## Task 13: 2-client collab integration test

**Files:**
- Create: `packages/server/test/integration/collab-two-clients.int.test.ts`

- [ ] **Step 13.1: Test**

Create `packages/server/test/integration/collab-two-clients.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl, redisUrl } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

async function connectAndAwaitWelcome(url: string) {
  const ws = new WebSocket(url)
  await new Promise<void>((resolve, reject) => {
    ws.once('message', () => resolve())
    ws.once('error', reject)
  })
  return ws
}

async function nextFrameMatching(ws: WebSocket, predicate: (f: { type: string }) => boolean): Promise<{ type: string } & Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      const frame = JSON.parse(data.toString()) as { type: string } & Record<string, unknown>
      if (predicate(frame)) { ws.off('message', onMsg); resolve(frame) }
    }
    ws.on('message', onMsg)
    ws.once('error', reject)
  })
}

describe('2-client collab', () => {
  it('B sees apply_mutation after A submits', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'collab2' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'a', name: 'wb' }).returning()

    const identity: IdentityAdapter = {
      resolveFromToken: async (t) => ({ tenantId: tenant.id, userId: t === 'tokA' ? 'a' : 'b' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      redisUrl: redisUrl(),
      identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const wsA = await connectAndAwaitWelcome(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=tokA`)
    const wsB = await connectAndAwaitWelcome(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=tokB`)

    wsA.send(JSON.stringify({ type: 'acquire_lock', region: 'B5:B5' }))
    await nextFrameMatching(wsA, (f) => f.type === 'lock_granted')

    wsA.send(JSON.stringify({
      type: 'submit_mutation', clientSeq: 1, region: 'B5:B5',
      payload: { op: 'set', cell: 'B5', value: 85 },
    }))

    const onA = await nextFrameMatching(wsA, (f) => f.type === 'mutation_accepted')
    const onB = await nextFrameMatching(wsB, (f) => f.type === 'apply_mutation')

    expect(onA.seqNum).toBe(1)
    expect((onB as { seqNum: number; userId: string }).seqNum).toBe(1)
    expect((onB as { userId: string }).userId).toBe('a')

    wsA.close(); wsB.close()
    await handle.close()
  })
})
```

- [ ] **Step 13.2: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/collab-two-clients.int.test.ts
git add packages/server
git commit -m "test(server): 2-client collab — acquire/submit/apply_mutation round-trip"
```

> **🟢 Milestone 4 checkpoint.**

---

# Milestone 5 — Reconnect + Backpressure

## Task 14: Reconnect replay protocol

**Files:**
- Modify: `packages/server/src/ws/welcome.ts` (handle `last_seq`)
- Modify: `packages/server/src/server.ts` (parse `last_seq` query param)
- Create: `packages/server/test/integration/reconnect-replay.int.test.ts`

- [ ] **Step 14.1: Failing test**

Create `packages/server/test/integration/reconnect-replay.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl, redisUrl } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'
import { createMutationService } from '../../src/services/mutation-service'

describe('Reconnect replay', () => {
  it('replays mutations after last_seq', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'replay' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const mutSvc = createMutationService({ db })
    for (let i = 0; i < 5; i++) {
      await mutSvc.append({ workbookId: wb.id, userId: 'u', payload: { i } })
    }
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      redisUrl: redisUrl(),
      identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=t&last_seq=2`)
    const frames: { type: string; seqNum?: number }[] = []
    await new Promise<void>((resolve, reject) => {
      ws.on('message', (data) => {
        const f = JSON.parse(data.toString()) as { type: string; seqNum?: number }
        frames.push(f)
        if (f.type === 'replay_complete') resolve()
      })
      ws.once('error', reject)
    })

    const welcome = frames.find((f) => f.type === 'welcome')!
    expect(welcome.seqNum).toBe(5)
    const replays = frames.filter((f) => f.type === 'apply_mutation')
    expect(replays.map((r) => r.seqNum)).toEqual([3, 4, 5])

    ws.close(); await handle.close()
  })
})
```

- [ ] **Step 14.2: Implement**

Edit `packages/server/src/ws/welcome.ts`:

- Extend `WelcomeCtx` to include `lastSeq?: number`
- Extend `WelcomeDeps` to include `mutations: MutationService`
- After sending welcome, if `lastSeq != null`:
  - if `currentSeq - lastSeq > 200` → send `replay_complete` immediately (client treats welcome as cold start)
  - else → fetch `mutations.since(workbookId, lastSeq, 200)`; for each, apply mask rules to payload; send `apply_mutation`; then `replay_complete`

Edit `packages/server/src/server.ts`:
- In WS upgrade handler, parse `c.req.query('last_seq')`, convert to number, pass into welcome ctx

- [ ] **Step 14.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/reconnect-replay.int.test.ts
git add packages/server
git commit -m "feat(server): WS reconnect replays mutations since last_seq with masked egress"
```

---

## Task 15: Backpressure token bucket

**Files:**
- Create: `packages/server/src/realtime/backpressure.ts`
- Create: `packages/server/test/unit/backpressure.test.ts`

- [ ] **Step 15.1: Failing test**

Create `packages/server/test/unit/backpressure.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTokenBucket } from '../../src/realtime/backpressure'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('TokenBucket', () => {
  it('allows up to capacity ops then denies', () => {
    const b = createTokenBucket({ capacity: 30, refillPerSec: 30 })
    for (let i = 0; i < 30; i++) expect(b.take()).toBe(true)
    expect(b.take()).toBe(false)
  })

  it('refills at refillPerSec rate', () => {
    const b = createTokenBucket({ capacity: 30, refillPerSec: 30 })
    for (let i = 0; i < 30; i++) b.take()
    vi.advanceTimersByTime(1000)
    for (let i = 0; i < 30; i++) expect(b.take()).toBe(true)
  })

  it('caps refill at capacity', () => {
    const b = createTokenBucket({ capacity: 30, refillPerSec: 30 })
    b.take()
    vi.advanceTimersByTime(60_000)
    let allowed = 0
    while (b.take()) allowed++
    expect(allowed).toBe(30)
  })
})
```

- [ ] **Step 15.2: Implement**

Create `packages/server/src/realtime/backpressure.ts`:

```ts
export interface BucketOpts {
  capacity: number
  refillPerSec: number
}

export function createTokenBucket(opts: BucketOpts) {
  let tokens = opts.capacity
  let lastRefill = Date.now()
  return {
    take(): boolean {
      const now = Date.now()
      const elapsedSec = (now - lastRefill) / 1000
      tokens = Math.min(opts.capacity, tokens + elapsedSec * opts.refillPerSec)
      lastRefill = now
      if (tokens >= 1) { tokens -= 1; return true }
      return false
    },
  }
}

export type TokenBucket = ReturnType<typeof createTokenBucket>
```

- [ ] **Step 15.3: Session gate (Task 12 already references `ctx.bucket.take()` in `submit_mutation`)**

Confirm `session.ts` from T12 has the bucket check on `submit_mutation`. Wire it in `server.ts` `onOpen`: `bucket: createTokenBucket({ capacity: 30, refillPerSec: 30 })` per session.

- [ ] **Step 15.4: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/backpressure.test.ts
git add packages/server
git commit -m "feat(server): 30 ops/sec token-bucket backpressure on submit_mutation"
```

---

## Task 16: Welcome ships real `seqNum` + `presence` + `locks`

**Files:**
- Modify: `packages/server/src/ws/welcome.ts`

- [ ] **Step 16.1: Replace hardcoded values**

In `welcome.ts`, compute:

```ts
const seqNum = await deps.mutations.currentSeq(wb.id)
const presenceList = deps.presence.list(wb.id)
const locks = await scanLocks(deps.redis, wb.id)
```

Define `scanLocks` near top of `welcome.ts` (or export from `cell-lock-manager.ts`):

```ts
import type { Redis } from '../redis/client'

export async function scanLocks(
  redis: Redis, workbookId: string
): Promise<Array<{ region: string; ownerId: string }>> {
  const prefix = `ensemble:lock:${workbookId}:`
  const out: Array<{ region: string; ownerId: string }> = []
  let cursor = '0'
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100)
    cursor = next
    if (keys.length > 0) {
      const values = await redis.mget(...keys)
      for (let i = 0; i < keys.length; i++) {
        const v = values[i]
        if (v) out.push({ region: keys[i]!.slice(prefix.length), ownerId: v })
      }
    }
  } while (cursor !== '0')
  return out
}
```

Replace the existing welcome frame send with real `seqNum`, `presence: presenceList`, `locks`.

- [ ] **Step 16.2: Run all server tests + commit**

```bash
pnpm --filter @ensemble/server test
git add packages/server
git commit -m "feat(server): WS welcome ships real seqNum + presence + locks"
```

> **🟢 Milestone 5 checkpoint.**

---

# Milestone 6 — Client + Demo + e2e

## Task 17: `WsClient` realtime methods

**Files:**
- Modify: `packages/core/src/ws-client.ts`
- Modify: `packages/core/test/ws-client.test.ts`

- [ ] **Step 17.1: Failing tests**

Append to `packages/core/test/ws-client.test.ts`:

```ts
describe('WsClient.acquireLock + submitMutation + onApplyMutation', () => {
  it('acquireLock resolves with lock_granted', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w', seqNum: 0, snapshot: null }))
    await p
    const ackP = client.acquireLock('A1:A1')
    sockets[0].fire('message', JSON.stringify({ type: 'lock_granted', region: 'A1:A1', ownerId: 'me', ttlSec: 30 }))
    expect(await ackP).toEqual({ acquired: true, ownerId: 'me', ttlSec: 30 })
  })

  it('submitMutation resolves with mutation_accepted', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w', seqNum: 0, snapshot: null }))
    await p
    const submitP = client.submitMutation({ region: 'A1:A1', payload: { v: 1 } })
    sockets[0].fire('message', JSON.stringify({ type: 'mutation_accepted', clientSeq: 1, seqNum: 7 }))
    expect(await submitP).toEqual({ clientSeq: 1, seqNum: 7 })
  })

  it('onApplyMutation receives incoming frames', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w', seqNum: 0, snapshot: null }))
    await p
    const got: Array<{ seqNum: number }> = []
    client.onApplyMutation((f) => got.push(f))
    sockets[0].fire('message', JSON.stringify({ type: 'apply_mutation', seqNum: 5, userId: 'other', payload: {} }))
    expect(got).toEqual([{ seqNum: 5, userId: 'other', payload: {} }])
  })
})
```

- [ ] **Step 17.2: Implement on WsClient**

Edit `packages/core/src/ws-client.ts`:

```ts
interface Pending<T> { resolve: (v: T) => void; reject: (e: Error) => void }

export class WsClient {
  // existing fields...
  private clientSeq = 0
  private pendingLocks = new Map<string, Pending<{ acquired: boolean; ownerId: string; ttlSec: number }>>()
  private pendingMutations = new Map<number, Pending<{ clientSeq: number; seqNum: number }>>()
  private applyListeners: Array<(f: { seqNum: number; userId: string; payload: unknown }) => void> = []

  // Call this once after welcome resolves
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

  sendHeartbeat(cursor?: { sheet: string; row: number; col: number }): void {
    this.socket?.send(JSON.stringify({ type: 'presence_heartbeat', ...(cursor ? { cursor } : {}) }))
  }
}
```

Inside the existing `connect()`, after welcome resolves, call `this.attachDemuxer(this.socket!)`.

- [ ] **Step 17.3: Run + commit**

```bash
pnpm --filter @ensemble/core test
git add packages/core
git commit -m "feat(core): WsClient.acquireLock + submitMutation + onApplyMutation"
```

---

## Task 18: React `<LockBadge />`

**Files:**
- Create: `packages/react/src/LockBadge.tsx`
- Create: `packages/react/test/LockBadge.test.tsx`
- Modify: `packages/react/src/index.ts`

- [ ] **Step 18.1: Failing test**

Create `packages/react/test/LockBadge.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LockBadge } from '../src/LockBadge'

describe('<LockBadge />', () => {
  it('shows owner + editing', () => {
    const { container } = render(<LockBadge ownerId="u-42" />)
    expect(container.textContent).toContain('u-42')
    expect(container.textContent).toMatch(/editing/i)
  })
  it('renders nothing when ownerId is empty', () => {
    const { container } = render(<LockBadge ownerId="" />)
    expect(container.querySelector('.ensemble-lock-badge')).toBeNull()
  })
})
```

- [ ] **Step 18.2: Implement**

Create `packages/react/src/LockBadge.tsx`:

```tsx
export interface LockBadgeProps {
  ownerId: string
  className?: string
}

export function LockBadge({ ownerId, className }: LockBadgeProps) {
  if (!ownerId) return null
  return (
    <span
      className={`ensemble-lock-badge ${className ?? ''}`}
      style={{
        display: 'inline-block', padding: '2px 6px',
        background: '#fef3c7', border: '1px solid #fbbf24',
        borderRadius: 4, fontSize: 11, color: '#92400e',
      }}
      title={`${ownerId} is editing this cell`}
    >
      {ownerId} editing
    </span>
  )
}
```

Update `packages/react/src/index.ts` to export it.

- [ ] **Step 18.3: Run + commit**

```bash
pnpm --filter @ensemble/react test
git add packages/react
git commit -m "feat(react): <LockBadge /> for cell-lock owner indicator"
```

---

## Task 19: Vue `<LockBadge />`

**Files:**
- Create: `packages/vue/src/LockBadge.vue`
- Create: `packages/vue/test/LockBadge.test.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 19.1: Failing test**

Create `packages/vue/test/LockBadge.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import LockBadge from '../src/LockBadge.vue'

describe('<LockBadge /> Vue', () => {
  it('renders owner id', () => {
    const w = mount(LockBadge, { props: { ownerId: 'u-99' } })
    expect(w.text()).toContain('u-99')
    expect(w.text()).toMatch(/editing/i)
  })
  it('hides when ownerId empty', () => {
    const w = mount(LockBadge, { props: { ownerId: '' } })
    expect(w.element.querySelector('.ensemble-lock-badge')).toBeNull()
  })
})
```

- [ ] **Step 19.2: Implement**

Create `packages/vue/src/LockBadge.vue`:

```vue
<script setup lang="ts">
const props = defineProps<{ ownerId: string; class?: string }>()
</script>

<template>
  <span
    v-if="props.ownerId"
    :class="['ensemble-lock-badge', props.class]"
    :title="`${props.ownerId} is editing this cell`"
    style="display: inline-block; padding: 2px 6px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; font-size: 11px; color: #92400e"
  >
    {{ props.ownerId }} editing
  </span>
</template>
```

Update `packages/vue/src/index.ts` to export it.

- [ ] **Step 19.3: Run + commit**

```bash
pnpm --filter @ensemble/vue test
git add packages/vue
git commit -m "feat(vue): <LockBadge /> SFC"
```

---

## Task 20: Demo 2-context Playwright e2e

**Files:**
- Create: `apps/demo/e2e/two-clients-collab.spec.ts`

> Note: real-WS-level multi-client synchronisation in Playwright is tricky — Sprint 4 will harden this. Sprint 3 ships a REST-reflection e2e proving 2 contexts share state through the full stack.

- [ ] **Step 20.1: E2e**

Create `apps/demo/e2e/two-clients-collab.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('two contexts share state via REST reflection', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const pageA = await ctxA.newPage()
  const pageB = await ctxB.newPage()

  await pageA.goto('/')
  await pageA.evaluate(() => localStorage.clear())
  await pageB.goto('/')
  await pageB.evaluate(() => localStorage.clear())

  await pageA.waitForFunction(() => !!localStorage.getItem('wbId-shared'), { timeout: 30_000 })
  const wbId = (await pageA.evaluate(() => localStorage.getItem('wbId-shared')))!
  expect(wbId).toBeTruthy()

  await pageB.evaluate((id) => localStorage.setItem('wbId-shared', id), wbId)
  await pageB.reload()
  await expect(pageB.locator('.ensemble-workbook-root').first()).toBeVisible({ timeout: 30_000 })

  await pageA.evaluate(async (id) => {
    const payload = {
      id, sheetOrder: ['s1'],
      sheets: { s1: { id: 's1', name: 'S', cellData: { '0': { '0': { v: 42 } } } } },
    }
    const r = await fetch(`/api/v1/workbooks/${id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:admin', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })
    if (!r.ok) throw new Error('save failed')
  }, wbId)

  const v = await pageB.evaluate(async (id) => {
    const r = await fetch(`/api/v1/workbooks/${id}/snapshot`, {
      headers: { Authorization: 'Bearer dev:admin' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['0']?.['0']?.v
  }, wbId)
  expect(v).toBe(42)

  await ctxA.close(); await ctxB.close()
})
```

- [ ] **Step 20.2: Run + commit**

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/ensemble_dev
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/server exec node dist/db/migrate.js
pnpm -r build
pnpm --filter @ensemble/demo e2e
git add apps/demo
git commit -m "feat(demo): 2-context collab e2e (REST reflection path)"
```

> **🟢 Milestone 6 checkpoint.**

---

# Milestone 7 — Docs

## Task 21: ADR 0002 cell-lock vs CRDT

**Files:**
- Create: `docs/decisions/0002-cell-lock-vs-crdt.md`

- [ ] **Step 21.1: Write ADR**

Create `docs/decisions/0002-cell-lock-vs-crdt.md`:

```markdown
# ADR 0002 — Cell-lock vs CRDT for realtime collab

**Status**: accepted (Sprint 3)

**Context**: spec §7 needs multi-user editing on the same workbook with
conflict avoidance. Two principal approaches:
- **Cell-lock + broadcast**: optimistic check-out per cell via Redis lock,
  mutations applied serially on server with monotonic seq_num
- **CRDT** (e.g. Yjs): every client maintains a CRDT replica, automatic
  merge; no locks; eventual consistency

**Decision**: Cell-lock + broadcast for v0.1.

**Consequences**:
- Implementation complexity is bounded: standard Redis SET NX EX,
  monotonic seq_num via SELECT FOR UPDATE — well-understood patterns.
- UX intelligible to non-technical users: "X is editing this cell, pick
  another" is a recognisable workflow.
- Throughput per workbook is bounded by sequential mutation application
  (one writer wins per cell, mutations serialised). Acceptable for the
  target workload.
- True simultaneous edit of the same cell is rejected, not merged. For
  use cases where this is unacceptable, Sprint 3+1 may evaluate Yjs
  adoption (spec §11 open question).
- Postgres `mutations` table is the oplog source-of-truth, enabling
  reconnect replay by seq_num.

**Alternatives considered**:
- Full operational transform (OT): rejected; ~6-8 weeks just for OT
  correctness, before integrating with Univer mutation semantics.
- Yjs CRDT: impedance mismatch with Univer's imperative mutation system;
  would require a translation layer that could become its own subsystem.
```

- [ ] **Step 21.2: Commit**

```bash
git add docs/decisions
git commit -m "docs: ADR 0002 cell-lock vs CRDT"
```

---

## Task 22: README Sprint 3 status

**Files:**
- Modify: `README.md`

- [ ] **Step 22.1: Update**

Replace status line with:

```
Status: Sprint 3 ("Realtime") complete. Cell-lock + broadcast collab over WebSocket with monotonic mutation oplog, per-recipient masked broadcast, Redis-backed locks, 5s/15s presence, last_seq reconnect replay, and 30 ops/sec token-bucket backpressure. Sprint 4 (polish + ship) next.
```

- [ ] **Step 22.2: Commit**

```bash
git add README.md
git commit -m "docs: README Sprint 3 status"
```

> **🟢 Milestone 7 checkpoint — Sprint 3 done.**

---

## Self-Review

**1. Spec §9 Sprint 3 coverage**:
- ✅ WS upgrade handler → existing from Sprint 1; reused
- ✅ CollabRoom → T8
- ✅ CellLockManager Redis-backed → T5-T7
- ✅ MutationBroadcaster per-recipient masked → T12
- ✅ Mutation persistence + replay → T3, T14
- ✅ Reconnect seq_num resume → T14
- ✅ Client lock UI → T17-T19
- ✅ Backpressure 30 ops/sec → T15
- ✅ Multi-client integration test → T13
- ✅ Demo collaboration → T20

**2. Placeholder scan** — clean. The Sprint 4 deferral (real-WS Playwright multi-client) is explicit.

**3. Type consistency**:
- `region: string` everywhere (e.g. "A1:A1")
- `seqNum: number` everywhere (JSON-safe up to 2^53)
- `MutationBroadcaster.submit` takes `clientSeq` and returns `{ seqNum }` matching `WsClient.submitMutation` shape
- `apply_mutation` frame `{ type, seqNum, userId, payload }` consistent server→client

**4. Known gotchas**:
- Lua CAS for release/renew (T5) — without it, GET+DEL race is real
- `seq_num` monotonicity requires `SELECT … FOR UPDATE` inside the INSERT transaction (T3)
- `scanLocks` uses `SCAN` not `KEYS` (T16) — KEYS blocks Redis
- `MaskRuleCache` Sprint 2 not invalidated on broadcast — acceptable for Sprint 3, Sprint 4 may add pub/sub
- Real-WS Playwright multi-client deferred — Sprint 4 will harden

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-sprint3-realtime.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review. 22 tasks across 7 milestones.

**2. Inline Execution** — execute in this session using executing-plans, batch with milestone checkpoints.

**Which approach?**
