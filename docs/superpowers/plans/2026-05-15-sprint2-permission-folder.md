# Sprint 2 — "Permission + Folder" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ensemble safely multi-tenant: Postgres RLS guards every query, host hooks (`IdentityAdapter` + `PermissionAdapter`) gate every REST/WS call, folders and share grants give users a real workspace, and snapshot egress respects per-recipient mask rules. The demo proves two users see different masked views of the same workbook.

**Architecture:**
- **Tenant isolation**: enable RLS on every table that has `tenant_id`; every request `SET LOCAL app.tenant_id = '<uuid>'` inside a transaction so RLS policies fire automatically.
- **Identity**: `@ensemble/identity-jwks` verifies host-issued JWTs against a JWKS endpoint (cached, key rotation aware). It returns an `IdentityContext` the server stamps onto every request.
- **Permission**: every route handler calls `PermissionAdapter.getCapabilities(identity, resource)` before touching data. Failures return 403.
- **Sharing**: `share_grants` table stores direct grants; resolution walks workbook → folder ancestors; `public_link` grants matched by signed token in query.
- **Masking**: pure function `applyMaskRules(workbookData, rules)` mutates JSON. Wired into `GET /workbooks/:id/snapshot` and WS welcome frame. Per-(user, workbook) cache, 60s TTL.
- **Frontend**: `<FolderNavigator>` (React + Vue) renders folder list and fires create/rename/move/delete.

**Tech Stack:** Same as Sprint 1 + `jose 5.x` for JWT/JWKS verification.

**Spec reference:** `docs/specs/2026-05-15-ensemble-design.md` (§4 data model, §5 adapter contracts, §6 folder + sharing, §8 mask application, §9 Sprint 2). Sprint 1 plan at `docs/superpowers/plans/2026-05-15-sprint1-it-opens.md`.

**Pre-condition:** Sprint 1 complete on `main` at commit `70eeea1` (or later).

---

## Conventions

- **Working dir** for all commands: `/Users/cedric/Projects.localized/ensemble` unless noted.
- **Coverage target**: keep server + core at the Sprint 1 levels (lines ≥90, branches ≥80). New code lands with tests.
- **TDD discipline**: every behaviour change: failing test → red → minimal impl → green → commit.
- **Tenancy invariant**: any new query helper that touches a `tenant_id`-carrying table MUST go through `withTenant(tenantId, async (tx) => …)`.

---

## Milestones

| Milestone | Tasks | Green-at-end definition |
|---|---|---|
| **M1: Multi-tenant RLS** | T1-T3 | RLS policies on folders/workbooks/snapshots; cross-tenant probe test fails closed; `withTenant` helper |
| **M2: identity-jwks** | T4-T6 | `@ensemble/identity-jwks` reference impl with JWKS cache + key rotation; 401 on bad JWT |
| **M3: share_grants** | T7-T10 | `share_grants` schema + GrantResolver walking folder ancestors + public_link tokens |
| **M4: Folder CRUD + endpoint enforcement** | T11-T16 | 4 folder endpoints + every workbook/snapshot route guarded by `PermissionAdapter` |
| **M5: Snapshot masking** | T17-T20 | Pure `applyMaskRules` covering 3 match × 3 action; wired into REST + WS; cache 60s TTL |
| **M6: Frontend + Demo + e2e** | T21-T25 | `@ensemble/core` folders/grants client; `<FolderNavigator>` React+Vue; demo two-pane masked-view e2e |

After each milestone: `pnpm -r test --coverage && pnpm -r build` clean before advancing.

---

## File structure delta (vs Sprint 1)

```
packages/server/
  drizzle/
    NNNN_share_grants.sql                       NEW: from drizzle-kit generate
    NNNN_rls_policies.sql                       NEW: handwritten — drizzle-kit does not emit RLS
  src/
    db/
      schema.ts                                 MODIFY: add share_grants table
      tenant-context.ts                         NEW: withTenant(tenantId, fn) — pg SET LOCAL app.tenant_id
    http/
      permission.ts                             NEW: requireCapability('canEdit') middleware factory
      routes/
        folders.ts                              NEW: LIST/POST/PATCH/DELETE /api/v1/folders
        grants.ts                               NEW: POST/DELETE /api/v1/grants
        workbooks.ts                            MODIFY: requireCapability on each route
        snapshots.ts                            MODIFY: GET applies mask; requireCapability on each route
    services/
      folder-service.ts                         NEW
      grant-service.ts                          NEW: resolveCapability
      grant-repository.ts                       NEW: DB-backed findGrants + folderAncestors
      mask-service.ts                           NEW: applyMaskRules + MaskRuleCache
    ws/
      welcome.ts                                MODIFY: apply masks before sending
  test/unit/                                    NEW files: tenant-context, grant-service, folder-service, permission-middleware, mask-service
  test/integration/                             NEW files: rls, grant-resolution, public-link, folders, workbooks-permission, grants, list-filter, snapshot-masking

packages/identity-jwks/                         NEW PACKAGE
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                                  JwksIdentityAdapter
  src/jwks-cache.ts                             JWKS fetch + TTL cache + kid-miss refresh
  test/                                         jwks-cache.test.ts + identity-jwks.test.ts

packages/core/
  src/api-client.ts                             MODIFY: add folders + grants methods
  src/types.ts                                  MODIFY: add Folder, Grant types

packages/react/
  src/FolderNavigator.tsx                       NEW
  test/FolderNavigator.test.tsx                 NEW

packages/vue/
  src/FolderNavigator.vue                       NEW
  test/FolderNavigator.test.ts                  NEW

apps/demo/
  src/main.tsx                                  MODIFY: 2 panes for admin + viewer
  src/server-runner.ts                          MODIFY: real PermissionAdapter (role-based) + per-user mask rules
  e2e/two-users-masked.spec.ts                  NEW
```

---

# Milestone 1 — Multi-tenant RLS

## Task 1: `withTenant` transaction helper

**Files:**
- Create: `packages/server/src/db/tenant-context.ts`
- Create: `packages/server/test/unit/tenant-context.test.ts`

- [ ] **Step 1.1: Failing unit test**

Create `packages/server/test/unit/tenant-context.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { withTenant } from '../../src/db/tenant-context'

describe('withTenant', () => {
  it('sets app.tenant_id at the transaction start', async () => {
    const calls: string[] = []
    const fakeTx = {
      execute: vi.fn(async (q: unknown) => {
        calls.push(String(q))
      }),
    }
    const fakeDb = {
      transaction: async (fn: (tx: typeof fakeTx) => Promise<unknown>) => fn(fakeTx),
    }
    const result = await withTenant(fakeDb as never, '11111111-1111-1111-1111-111111111111', async (tx) => {
      await tx.execute('SELECT 1')
      return 'ok'
    })
    expect(result).toBe('ok')
    expect(calls[0]).toMatch(/set_config/i)
    expect(calls[1]).toBe('SELECT 1')
  })

  it('rejects empty / non-uuid tenant ids', async () => {
    const fakeDb = { transaction: vi.fn() }
    await expect(withTenant(fakeDb as never, '', async () => 1)).rejects.toThrow(/tenant/i)
    await expect(withTenant(fakeDb as never, 'not-a-uuid', async () => 1)).rejects.toThrow(/uuid/i)
  })
})
```

- [ ] **Step 1.2: Run — expect fail**

```bash
pnpm --filter @ensemble/server test test/unit/tenant-context.test.ts
```

Expected: FAIL (`Cannot find module`).

- [ ] **Step 1.3: Implement**

Create `packages/server/src/db/tenant-context.ts`:

```ts
import { sql } from 'drizzle-orm'
import type { Database } from './client'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  if (!tenantId) throw new Error('withTenant: tenantId required')
  if (!UUID_RE.test(tenantId)) throw new Error('withTenant: tenantId must be a uuid')
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`)
    return fn(tx)
  })
}
```

- [ ] **Step 1.4: Run — expect pass + commit**

```bash
pnpm --filter @ensemble/server test test/unit/tenant-context.test.ts
git add packages/server
git commit -m "feat(server): withTenant helper for RLS-aware transactions"
```

---

## Task 2: Enable Postgres RLS + write policies migration

**Files:**
- Create: `packages/server/drizzle/0002_rls.sql` (handwritten)

- [ ] **Step 2.1: Write the migration**

Create `packages/server/drizzle/0002_rls.sql`:

```sql
ALTER TABLE folders   ENABLE ROW LEVEL SECURITY;
ALTER TABLE workbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY folders_tenant_isolation ON folders
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY workbooks_tenant_isolation ON workbooks
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

CREATE POLICY snapshots_tenant_isolation ON snapshots
  USING (
    workbook_id IN (
      SELECT id FROM workbooks
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  )
  WITH CHECK (
    workbook_id IN (
      SELECT id FROM workbooks
      WHERE tenant_id::text = current_setting('app.tenant_id', true)
    )
  );
```

- [ ] **Step 2.2: Update drizzle journal**

Append an entry to `packages/server/drizzle/meta/_journal.json` mirroring existing entries (idx incremented, tag `0002_rls`, when=unix-ms, breakpoints=true). If drizzle-kit's format rejects handwritten entries, run `pnpm --filter @ensemble/server exec drizzle-kit generate --custom` and replace the generated empty file's contents.

- [ ] **Step 2.3: Verify migration runs against fresh container**

```bash
docker rm -f ensemble-rls-test 2>/dev/null || true
docker run -d --name ensemble-rls-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=test -p 54322:5432 postgres:16
sleep 5
DATABASE_URL=postgres://postgres:postgres@localhost:54322/test pnpm --filter @ensemble/server exec node dist/db/migrate.js
docker exec ensemble-rls-test psql -U postgres -d test -c "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public';"
docker rm -f ensemble-rls-test
```

Expected: rowsecurity = t for folders/workbooks/snapshots.

- [ ] **Step 2.4: Commit**

```bash
git add packages/server/drizzle
git commit -m "feat(server): enable Postgres RLS policies for tenant isolation"
```

---

## Task 3: Cross-tenant probe integration test

**Files:**
- Create: `packages/server/test/integration/rls.int.test.ts`
- Modify: `packages/server/test/integration/_globalSetup.ts` (ALTER USER postgres BYPASSRLS for seed phase)

- [ ] **Step 3.1: Update globalSetup**

Add to `packages/server/test/integration/_globalSetup.ts` after `migrate()` finishes:

```ts
import postgres from 'postgres'
// inside the setup function, after migration:
const sqlClient = postgres(url, { max: 1 })
await sqlClient`ALTER USER postgres BYPASSRLS`
await sqlClient.end()
```

- [ ] **Step 3.2: Failing integration test**

Create `packages/server/test/integration/rls.int.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { withTenant } from '../../src/db/tenant-context'

describe('Postgres RLS', () => {
  it('blocks cross-tenant SELECT', async () => {
    const [a] = await db.insert(tenants).values({ name: 'rls-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'rls-b' }).returning()
    await db.insert(workbooks).values({ tenantId: a.id, ownerId: 'u-a', name: 'A only' })
    await db.insert(workbooks).values({ tenantId: b.id, ownerId: 'u-b', name: 'B only' })

    const fromA = await withTenant(db, a.id, async (tx) => tx.select().from(workbooks))
    expect(fromA.map((w) => w.name)).toEqual(['A only'])

    const fromB = await withTenant(db, b.id, async (tx) => tx.select().from(workbooks))
    expect(fromB.map((w) => w.name)).toEqual(['B only'])
  })

  it('blocks INSERT into another tenant via WITH CHECK', async () => {
    const [a] = await db.insert(tenants).values({ name: 'rls-check-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 'rls-check-b' }).returning()
    await expect(
      withTenant(db, a.id, async (tx) =>
        tx.insert(workbooks).values({ tenantId: b.id, ownerId: 'attacker', name: 'pwned' })
      )
    ).rejects.toThrow(/policy/i)
  })

  it('snapshot visibility follows workbook tenant', async () => {
    const [a] = await db.insert(tenants).values({ name: 'snap-rls-a' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: a.id, ownerId: 'u', name: 'with-snap' }).returning()
    await db.execute(sql`
      INSERT INTO snapshots (workbook_id, storage_key, size_bytes, created_by, reason)
      VALUES (${wb.id}, 'k', 0, 'u', 'manual')
    `)
    const [other] = await db.insert(tenants).values({ name: 'snap-rls-other' }).returning()
    const snapsOther = await withTenant(db, other.id, async (tx) =>
      tx.execute(sql`SELECT * FROM snapshots`)
    )
    expect(snapsOther).toHaveLength(0)
  })
})
```

- [ ] **Step 3.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/rls.int.test.ts
git add packages/server
git commit -m "test(server): cross-tenant probe + WITH CHECK + snapshot RLS integration tests"
```

> **🟢 Milestone 1 checkpoint** — server test count +3, all green.

---

# Milestone 2 — `@ensemble/identity-jwks`

## Task 4: Package skeleton + JWKS cache

**Files:**
- Create: `packages/identity-jwks/package.json`
- Create: `packages/identity-jwks/tsconfig.json`
- Create: `packages/identity-jwks/vitest.config.ts`
- Create: `packages/identity-jwks/src/jwks-cache.ts`
- Create: `packages/identity-jwks/test/jwks-cache.test.ts`

- [ ] **Step 4.1: Package manifest**

Create `packages/identity-jwks/package.json`:

```json
{
  "name": "@ensemble/identity-jwks",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/kdldbq/ensemble.git",
    "directory": "packages/identity-jwks"
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": { "@ensemble/server": "workspace:*" },
  "dependencies": { "jose": "5.9.6" },
  "devDependencies": {
    "@ensemble/server": "workspace:*",
    "@types/node": "20.16.10"
  }
}
```

Create `packages/identity-jwks/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src"]
}
```

Create `packages/identity-jwks/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
  },
})
```

- [ ] **Step 4.2: Failing test**

Create `packages/identity-jwks/test/jwks-cache.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { JwksCache } from '../src/jwks-cache'

const sampleJwks = {
  keys: [
    { kid: 'key-1', kty: 'RSA', n: 'a', e: 'AQAB', alg: 'RS256', use: 'sig' },
    { kid: 'key-2', kty: 'RSA', n: 'b', e: 'AQAB', alg: 'RS256', use: 'sig' },
  ],
}

function makeFetch(handler: () => Response) {
  return vi.fn(async () => handler())
}

describe('JwksCache', () => {
  it('fetches once and caches', async () => {
    const fetch = makeFetch(() => new Response(JSON.stringify(sampleJwks), { status: 200 }))
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await cache.getKey('key-1')
    await cache.getKey('key-2')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('force-refreshes on kid miss', async () => {
    let call = 0
    const fetch = makeFetch(() => {
      call += 1
      if (call === 1) return new Response(JSON.stringify({ keys: [sampleJwks.keys[0]] }), { status: 200 })
      return new Response(JSON.stringify(sampleJwks), { status: 200 })
    })
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await cache.getKey('key-1')
    const k2 = await cache.getKey('key-2')
    expect(k2.kid).toBe('key-2')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('throws after refresh if kid still missing', async () => {
    const fetch = makeFetch(() => new Response(JSON.stringify({ keys: [sampleJwks.keys[0]] }), { status: 200 }))
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch })
    await expect(cache.getKey('unknown-kid')).rejects.toThrow(/kid/i)
  })

  it('respects TTL', async () => {
    vi.useFakeTimers()
    const fetch = makeFetch(() => new Response(JSON.stringify(sampleJwks), { status: 200 }))
    const cache = new JwksCache({ jwksUrl: 'https://x/jwks', fetch, ttlMs: 60_000 })
    await cache.getKey('key-1')
    vi.advanceTimersByTime(60_001)
    await cache.getKey('key-1')
    expect(fetch).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
```

- [ ] **Step 4.3: Implement**

Create `packages/identity-jwks/src/jwks-cache.ts`:

```ts
export interface Jwk {
  kid: string
  kty: string
  alg?: string
  use?: string
  n?: string
  e?: string
  [k: string]: unknown
}

export interface JwksCacheOpts {
  jwksUrl: string
  fetch?: typeof fetch
  ttlMs?: number
  refreshCooldownMs?: number
}

export class JwksCache {
  private readonly jwksUrl: string
  private readonly fetchImpl: typeof fetch
  private readonly ttlMs: number
  private readonly refreshCooldownMs: number
  private keysByKid: Map<string, Jwk> = new Map()
  private lastFetchAt = 0

  constructor(opts: JwksCacheOpts) {
    this.jwksUrl = opts.jwksUrl
    this.fetchImpl = opts.fetch ?? globalThis.fetch
    this.ttlMs = opts.ttlMs ?? 60 * 60_000
    this.refreshCooldownMs = opts.refreshCooldownMs ?? 10_000
  }

  async getKey(kid: string): Promise<Jwk> {
    if (this.shouldRefresh()) await this.fetchKeys()
    const cached = this.keysByKid.get(kid)
    if (cached) return cached
    if (Date.now() - this.lastFetchAt > this.refreshCooldownMs) {
      await this.fetchKeys()
      const after = this.keysByKid.get(kid)
      if (after) return after
    }
    throw new Error(`JwksCache: kid '${kid}' not found in JWKS`)
  }

  private shouldRefresh(): boolean {
    return this.keysByKid.size === 0 || Date.now() - this.lastFetchAt > this.ttlMs
  }

  private async fetchKeys(): Promise<void> {
    const res = await this.fetchImpl(this.jwksUrl)
    if (!res.ok) throw new Error(`JwksCache: ${this.jwksUrl} returned ${res.status}`)
    const body = (await res.json()) as { keys: Jwk[] }
    const next = new Map<string, Jwk>()
    for (const k of body.keys ?? []) {
      if (k.kid) next.set(k.kid, k)
    }
    this.keysByKid = next
    this.lastFetchAt = Date.now()
  }
}
```

- [ ] **Step 4.4: Run + commit**

```bash
pnpm install
pnpm --filter @ensemble/identity-jwks test
git add packages/identity-jwks pnpm-lock.yaml
git commit -m "feat(identity-jwks): JWKS fetch + TTL cache + kid-miss refresh"
```

---

## Task 5: `JwksIdentityAdapter` JWT verify

**Files:**
- Create: `packages/identity-jwks/src/index.ts`
- Create: `packages/identity-jwks/test/identity-jwks.test.ts`

- [ ] **Step 5.1: Failing test using real jose to sign**

Create `packages/identity-jwks/test/identity-jwks.test.ts`:

```ts
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { describe, expect, it, vi } from 'vitest'
import { JwksIdentityAdapter } from '../src/index'

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048, extractable: true })
  const jwk = await exportJWK(publicKey)
  ;(jwk as { kid: string; alg: string; use: string }).kid = 'test-key'
  ;(jwk as { kid: string; alg: string; use: string }).alg = 'RS256'
  ;(jwk as { kid: string; alg: string; use: string }).use = 'sig'
  const jwks = { keys: [jwk] }
  const fetch = vi.fn(async () => new Response(JSON.stringify(jwks), { status: 200 }))
  return { privateKey, fetch }
}

async function sign(privateKey: CryptoKey, claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer('test-issuer')
    .setAudience('test-audience')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey)
}

describe('JwksIdentityAdapter', () => {
  it('returns IdentityContext from valid JWT', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks', issuer: 'test-issuer', audience: 'test-audience', fetch,
    })
    const token = await sign(privateKey, {
      sub: 'user-42',
      tenant_id: '11111111-1111-1111-1111-111111111111',
      email: 'u@example.com',
      roles: ['teacher'],
    })
    const ctx = await adapter.resolveFromToken(token)
    expect(ctx).toEqual({
      tenantId: '11111111-1111-1111-1111-111111111111',
      userId: 'user-42',
      email: 'u@example.com',
      roles: ['teacher'],
    })
  })

  it('rejects expired JWT', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks', issuer: 'test-issuer', audience: 'test-audience', fetch,
    })
    const token = await new SignJWT({ sub: 'u', tenant_id: '22222222-2222-2222-2222-222222222222' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('test-issuer').setAudience('test-audience')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey)
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/exp/i)
  })

  it('rejects wrong audience', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks', issuer: 'test-issuer', audience: 'test-audience', fetch,
    })
    const token = await new SignJWT({ sub: 'u', tenant_id: '33333333-3333-3333-3333-333333333333' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('test-issuer').setAudience('wrong-aud')
      .setIssuedAt().setExpirationTime('5m')
      .sign(privateKey)
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/aud/i)
  })

  it('rejects missing tenant_id claim', async () => {
    const { privateKey, fetch } = await setup()
    const adapter = new JwksIdentityAdapter({
      jwksUrl: 'https://host/jwks', issuer: 'test-issuer', audience: 'test-audience', fetch,
    })
    const token = await sign(privateKey, { sub: 'u' })
    await expect(adapter.resolveFromToken(token)).rejects.toThrow(/tenant_id/i)
  })
})
```

- [ ] **Step 5.2: Implement**

Create `packages/identity-jwks/src/index.ts`:

```ts
import { importJWK, jwtVerify } from 'jose'
import type { IdentityAdapter, IdentityContext } from '@ensemble/server'
import { JwksCache, type Jwk } from './jwks-cache'

export interface JwksIdentityOpts {
  jwksUrl: string
  issuer: string
  audience: string
  fetch?: typeof fetch
  ttlMs?: number
  tenantClaim?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class JwksIdentityAdapter implements IdentityAdapter {
  private readonly cache: JwksCache
  private readonly issuer: string
  private readonly audience: string
  private readonly tenantClaim: string

  constructor(opts: JwksIdentityOpts) {
    this.cache = new JwksCache({
      jwksUrl: opts.jwksUrl,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.ttlMs !== undefined ? { ttlMs: opts.ttlMs } : {}),
    })
    this.issuer = opts.issuer
    this.audience = opts.audience
    this.tenantClaim = opts.tenantClaim ?? 'tenant_id'
  }

  async resolveFromToken(token: string): Promise<IdentityContext> {
    const { payload } = await jwtVerify(
      token,
      async (header) => {
        if (!header.kid) throw new Error('JWT missing kid header')
        const jwk = await this.cache.getKey(header.kid)
        return (await importJWK(jwk as Jwk, header.alg ?? 'RS256')) as CryptoKey
      },
      { issuer: this.issuer, audience: this.audience }
    )

    const p = payload as Record<string, unknown>
    const tenantId = p[this.tenantClaim]
    if (typeof tenantId !== 'string' || !UUID_RE.test(tenantId)) {
      throw new Error(`JwksIdentityAdapter: ${this.tenantClaim} claim missing or not a uuid`)
    }
    const userId = payload.sub
    if (!userId) throw new Error('JwksIdentityAdapter: sub claim required')

    const ctx: IdentityContext = { tenantId, userId }
    if (typeof p.email === 'string') ctx.email = p.email
    if (typeof p.name === 'string') ctx.displayName = p.name
    if (Array.isArray(p.roles)) ctx.roles = p.roles.filter((r): r is string => typeof r === 'string')
    return ctx
  }
}
```

- [ ] **Step 5.3: Run + commit**

```bash
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/identity-jwks test
git add packages/identity-jwks
git commit -m "feat(identity-jwks): JwksIdentityAdapter with issuer/audience/tenant claim validation"
```

---

## Task 6: Identity-jwks coverage gate

**Files:**
- Modify: `packages/identity-jwks/vitest.config.ts` (already has thresholds from T4)

- [ ] **Step 6.1: Verify coverage**

```bash
pnpm --filter @ensemble/identity-jwks test -- --coverage
```

Expected: 8/8 pass + thresholds met. If branches short, add a test for fetch failure or stale-TTL refresh.

- [ ] **Step 6.2: Commit if any test additions**

```bash
git add packages/identity-jwks
git commit -m "test(identity-jwks): confirm coverage thresholds"
```

> **🟢 Milestone 2 checkpoint.**

---

# Milestone 3 — `share_grants` + GrantResolver

## Task 7: `share_grants` schema + migration

**Files:**
- Modify: `packages/server/src/db/schema.ts`
- Generate: `packages/server/drizzle/0003_share_grants.sql`
- Create: `packages/server/drizzle/0004_rls_share_grants.sql`

- [ ] **Step 7.1: Add table to schema**

Edit `packages/server/src/db/schema.ts` — append:

```ts
export const grantResourceType = pgEnum('grant_resource_type', ['folder', 'workbook'])
export const granteeType = pgEnum('grantee_type', ['user', 'tenant_member', 'public_link'])
export const permissionLevel = pgEnum('permission_level', ['view', 'edit', 'manage'])

export const shareGrants = pgTable('share_grants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  resourceType: grantResourceType('resource_type').notNull(),
  resourceId: uuid('resource_id').notNull(),
  granteeType: granteeType('grantee_type').notNull(),
  granteeId: text('grantee_id'),
  permission: permissionLevel('permission').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  grantedBy: text('granted_by').notNull(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 7.2: Generate migration**

```bash
pnpm --filter @ensemble/server exec drizzle-kit generate --name share_grants
```

- [ ] **Step 7.3: Add RLS migration**

Create `packages/server/drizzle/0004_rls_share_grants.sql`:

```sql
ALTER TABLE share_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY share_grants_tenant_isolation ON share_grants
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));
```

Update `_journal.json` for this handwritten migration too.

- [ ] **Step 7.4: Verify + commit**

```bash
pnpm --filter @ensemble/server build
docker rm -f sg-test 2>/dev/null
docker run -d --name sg-test -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=t -p 54323:5432 postgres:16
sleep 5
DATABASE_URL=postgres://postgres:postgres@localhost:54323/t pnpm --filter @ensemble/server exec node dist/db/migrate.js
docker exec sg-test psql -U postgres -d t -c "\d share_grants"
docker rm -f sg-test

git add packages/server/src/db packages/server/drizzle
git commit -m "feat(server): share_grants schema + RLS policy"
```

---

## Task 8: GrantResolver service (folder ancestor walk)

**Files:**
- Create: `packages/server/src/services/grant-service.ts`
- Create: `packages/server/test/unit/grant-service.test.ts`

- [ ] **Step 8.1: Failing unit test**

Create `packages/server/test/unit/grant-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resolveCapability, type GrantContext } from '../../src/services/grant-service'

function ctx(overrides: Partial<GrantContext> = {}): GrantContext {
  return {
    identity: { tenantId: 't1', userId: 'u1' },
    resource: { type: 'workbook', id: 'wb1', tenantId: 't1' },
    workbookOwnerId: 'someone-else',
    workbookFolderId: null,
    folderAncestors: async () => [],
    findGrants: async () => [],
    ...overrides,
  }
}

describe('resolveCapability', () => {
  it('owner always has full capability', async () => {
    const c = await resolveCapability(ctx({ workbookOwnerId: 'u1' }))
    expect(c).toEqual({ canView: true, canEdit: true, canShare: true, canDelete: true })
  })

  it('user grant view → only canView', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'view', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: false, canShare: false, canDelete: false })
  })

  it('user grant edit → canView + canEdit', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'edit', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: true, canShare: false, canDelete: false })
  })

  it('tenant_member grant applies to anyone in tenant', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'tenant_member', granteeId: null,
          permission: 'view', expiresAt: null,
        }],
      })
    )
    expect(c.canView).toBe(true)
  })

  it('expired grant is ignored', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'edit', expiresAt: new Date(Date.now() - 1000),
        }],
      })
    )
    expect(c).toEqual({ canView: false, canEdit: false, canShare: false, canDelete: false })
  })

  it('ancestor folder grant cascades to workbook', async () => {
    const c = await resolveCapability(
      ctx({
        workbookFolderId: 'folder-leaf',
        folderAncestors: async () => ['folder-leaf', 'folder-middle', 'folder-root'],
        findGrants: async (refs) => {
          if (refs.some((r) => r.resourceId === 'folder-middle')) {
            return [{
              resourceType: 'folder', resourceId: 'folder-middle',
              granteeType: 'user', granteeId: 'u1',
              permission: 'edit', expiresAt: null,
            }]
          }
          return []
        },
      })
    )
    expect(c.canEdit).toBe(true)
  })

  it('manage grant unlocks share + delete', async () => {
    const c = await resolveCapability(
      ctx({
        findGrants: async () => [{
          resourceType: 'workbook', resourceId: 'wb1',
          granteeType: 'user', granteeId: 'u1',
          permission: 'manage', expiresAt: null,
        }],
      })
    )
    expect(c).toEqual({ canView: true, canEdit: true, canShare: true, canDelete: true })
  })
})
```

- [ ] **Step 8.2: Implement**

Create `packages/server/src/services/grant-service.ts`:

```ts
import type { Capability, IdentityContext, ResourceRef } from '../adapters/types'

export interface Grant {
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId: string | null
  permission: 'view' | 'edit' | 'manage'
  expiresAt: Date | null
}

export interface GrantContext {
  identity: IdentityContext
  resource: ResourceRef
  workbookOwnerId: string
  workbookFolderId: string | null
  folderAncestors: () => Promise<string[]>
  findGrants: (refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }>) => Promise<Grant[]>
  publicLinkToken?: string | undefined
}

const EMPTY: Capability = { canView: false, canEdit: false, canShare: false, canDelete: false }

function levelToCapability(level: Grant['permission']): Capability {
  switch (level) {
    case 'view':   return { canView: true, canEdit: false, canShare: false, canDelete: false }
    case 'edit':   return { canView: true, canEdit: true,  canShare: false, canDelete: false }
    case 'manage': return { canView: true, canEdit: true,  canShare: true,  canDelete: true  }
  }
}

function merge(a: Capability, b: Capability): Capability {
  return {
    canView:   a.canView   || b.canView,
    canEdit:   a.canEdit   || b.canEdit,
    canShare:  a.canShare  || b.canShare,
    canDelete: a.canDelete || b.canDelete,
  }
}

function isApplicable(grant: Grant, identity: IdentityContext, presentedToken?: string): boolean {
  if (grant.expiresAt && grant.expiresAt.getTime() < Date.now()) return false
  switch (grant.granteeType) {
    case 'user':          return grant.granteeId === identity.userId
    case 'tenant_member': return true
    case 'public_link':   return !!presentedToken && grant.granteeId === presentedToken
  }
}

export async function resolveCapability(ctx: GrantContext): Promise<Capability> {
  if (ctx.workbookOwnerId === ctx.identity.userId) {
    return { canView: true, canEdit: true, canShare: true, canDelete: true }
  }
  const refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }> = [
    { resourceType: ctx.resource.type, resourceId: ctx.resource.id },
  ]
  const ancestors = ctx.workbookFolderId ? await ctx.folderAncestors() : []
  for (const fid of ancestors) refs.push({ resourceType: 'folder', resourceId: fid })

  const grants = await ctx.findGrants(refs)
  let acc: Capability = EMPTY
  for (const g of grants) {
    if (isApplicable(g, ctx.identity, ctx.publicLinkToken)) {
      acc = merge(acc, levelToCapability(g.permission))
    }
  }
  return acc
}
```

- [ ] **Step 8.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/grant-service.test.ts
git add packages/server
git commit -m "feat(server): GrantResolver with folder ancestor walk + grantee types + expiry"
```

---

## Task 9: Grant repository (DB-backed) + integration test

**Files:**
- Create: `packages/server/src/services/grant-repository.ts`
- Create: `packages/server/test/integration/grant-resolution.int.test.ts`

- [ ] **Step 9.1: Implement repository**

Create `packages/server/src/services/grant-repository.ts`:

```ts
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { shareGrants } from '../db/schema'
import type { Grant } from './grant-service'

export function createGrantRepository(db: Database) {
  return {
    async folderAncestors(folderId: string): Promise<string[]> {
      const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE chain AS (
          SELECT id, parent_id FROM folders WHERE id = ${folderId} AND is_deleted = false
          UNION ALL
          SELECT f.id, f.parent_id FROM folders f INNER JOIN chain c ON f.id = c.parent_id
          WHERE f.is_deleted = false
        )
        SELECT id FROM chain
      `)
      return rows.map((r) => r.id)
    },

    async findGrants(
      refs: Array<{ resourceType: 'folder' | 'workbook'; resourceId: string }>
    ): Promise<Grant[]> {
      if (refs.length === 0) return []
      const folderIds = refs.filter((r) => r.resourceType === 'folder').map((r) => r.resourceId)
      const workbookIds = refs.filter((r) => r.resourceType === 'workbook').map((r) => r.resourceId)
      const conditions = []
      if (folderIds.length) {
        conditions.push(and(eq(shareGrants.resourceType, 'folder'), inArray(shareGrants.resourceId, folderIds)))
      }
      if (workbookIds.length) {
        conditions.push(and(eq(shareGrants.resourceType, 'workbook'), inArray(shareGrants.resourceId, workbookIds)))
      }
      if (conditions.length === 0) return []
      const rows = await db.select().from(shareGrants).where(or(...conditions))
      return rows.map((r) => ({
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        granteeType: r.granteeType,
        granteeId: r.granteeId,
        permission: r.permission,
        expiresAt: r.expiresAt,
      }))
    },
  }
}

export type GrantRepository = ReturnType<typeof createGrantRepository>
```

- [ ] **Step 9.2: Integration test**

Create `packages/server/test/integration/grant-resolution.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { folders, shareGrants, tenants, workbooks } from '../../src/db/schema'
import { createGrantRepository } from '../../src/services/grant-repository'
import { resolveCapability } from '../../src/services/grant-service'

describe('grant resolution', () => {
  it('cascades a folder-level edit grant to a child workbook', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-1' }).returning()
    const [root] = await db.insert(folders).values({
      tenantId: tenant.id, parentId: null, name: 'shared-root',
      ownerId: 'owner', spaceType: 'shared',
    }).returning()
    const [child] = await db.insert(folders).values({
      tenantId: tenant.id, parentId: root.id, name: 'child',
      ownerId: 'owner', spaceType: 'shared',
    }).returning()
    const [wb] = await db.insert(workbooks).values({
      tenantId: tenant.id, folderId: child.id, name: 'inherited', ownerId: 'owner',
    }).returning()
    await db.insert(shareGrants).values({
      tenantId: tenant.id, resourceType: 'folder', resourceId: root.id,
      granteeType: 'user', granteeId: 'guest', permission: 'edit', grantedBy: 'owner',
    })

    const repo = createGrantRepository(db)
    const cap = await resolveCapability({
      identity: { tenantId: tenant.id, userId: 'guest' },
      resource: { type: 'workbook', id: wb.id, tenantId: tenant.id },
      workbookOwnerId: wb.ownerId,
      workbookFolderId: child.id,
      folderAncestors: () => repo.folderAncestors(child.id),
      findGrants: (refs) => repo.findGrants(refs),
    })
    expect(cap).toEqual({ canView: true, canEdit: true, canShare: false, canDelete: false })
  })
})
```

- [ ] **Step 9.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/grant-resolution.int.test.ts
git add packages/server
git commit -m "feat(server): grant repository (folderAncestors recursive CTE + findGrants) + integration test"
```

---

## Task 10: public_link grant integration test

**Files:**
- Create: `packages/server/test/integration/public-link.int.test.ts`

- [ ] **Step 10.1: Write test**

Create `packages/server/test/integration/public-link.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { shareGrants, tenants, workbooks } from '../../src/db/schema'
import { createGrantRepository } from '../../src/services/grant-repository'
import { resolveCapability } from '../../src/services/grant-service'

describe('public_link grants', () => {
  it('grants view only when token matches', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'pl' }).returning()
    const [wb] = await db.insert(workbooks).values({
      tenantId: tenant.id, name: 'public', ownerId: 'owner',
    }).returning()
    const token = 'secret-link-token-' + crypto.randomUUID()
    await db.insert(shareGrants).values({
      tenantId: tenant.id, resourceType: 'workbook', resourceId: wb.id,
      granteeType: 'public_link', granteeId: token, permission: 'view', grantedBy: 'owner',
    })

    const repo = createGrantRepository(db)
    const ctxBase = {
      identity: { tenantId: tenant.id, userId: 'anonymous' },
      resource: { type: 'workbook' as const, id: wb.id, tenantId: tenant.id },
      workbookOwnerId: 'owner',
      workbookFolderId: null as string | null,
      folderAncestors: async () => [],
      findGrants: (refs: Parameters<ReturnType<typeof createGrantRepository>['findGrants']>[0]) =>
        repo.findGrants(refs),
    }

    const ok = await resolveCapability({ ...ctxBase, publicLinkToken: token })
    expect(ok.canView).toBe(true)
    const denied = await resolveCapability(ctxBase)
    expect(denied.canView).toBe(false)
    const wrong = await resolveCapability({ ...ctxBase, publicLinkToken: 'wrong' })
    expect(wrong.canView).toBe(false)
  })
})
```

- [ ] **Step 10.2: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/public-link.int.test.ts
git add packages/server
git commit -m "test(server): public_link grant resolution integration"
```

> **🟢 Milestone 3 checkpoint** — server has share_grants schema, GrantResolver, repository, ~11 new tests.

---

# Milestone 4 — Folder CRUD + endpoint enforcement

## Task 11: FolderService

**Files:**
- Create: `packages/server/src/services/folder-service.ts`
- Create: `packages/server/test/unit/folder-service.test.ts`

- [ ] **Step 11.1: Failing test (cycle check)**

Create `packages/server/test/unit/folder-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { wouldCreateCycle } from '../../src/services/folder-service'

describe('wouldCreateCycle', () => {
  const tree = new Map<string, string | null>([
    ['root', null], ['a', 'root'], ['b', 'a'], ['c', 'b'],
  ])
  const parentOf = async (id: string) => tree.get(id) ?? null

  it('moving a into b creates a cycle', async () => {
    expect(await wouldCreateCycle('a', 'b', parentOf)).toBe(true)
  })
  it('moving a under root is fine', async () => {
    expect(await wouldCreateCycle('a', 'root', parentOf)).toBe(false)
  })
  it('moving a to null is fine', async () => {
    expect(await wouldCreateCycle('a', null, parentOf)).toBe(false)
  })
  it('moving a into itself is rejected', async () => {
    expect(await wouldCreateCycle('a', 'a', parentOf)).toBe(true)
  })
})
```

- [ ] **Step 11.2: Implement**

Create `packages/server/src/services/folder-service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { folders } from '../db/schema'

export async function wouldCreateCycle(
  movingId: string,
  newParentId: string | null,
  parentOf: (id: string) => Promise<string | null>
): Promise<boolean> {
  if (newParentId === null) return false
  if (newParentId === movingId) return true
  let current: string | null = newParentId
  const seen = new Set<string>()
  while (current) {
    if (current === movingId) return true
    if (seen.has(current)) return false
    seen.add(current)
    current = await parentOf(current)
  }
  return false
}

export function createFolderService(db: Database) {
  return {
    async create(input: {
      tenantId: string; userId: string; name: string
      parentId: string | null; spaceType: 'personal' | 'shared'
    }) {
      const [row] = await db.insert(folders).values({
        tenantId: input.tenantId,
        parentId: input.parentId ?? null,
        name: input.name,
        ownerId: input.userId,
        spaceType: input.spaceType,
      }).returning()
      return row
    },
    async rename(input: { tenantId: string; id: string; name: string }) {
      const [row] = await db.update(folders).set({ name: input.name, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },
    async move(input: { tenantId: string; id: string; newParentId: string | null }) {
      const parentOf = async (id: string): Promise<string | null> => {
        const rows = await db.select({ parentId: folders.parentId }).from(folders)
          .where(eq(folders.id, id)).limit(1)
        return rows[0]?.parentId ?? null
      }
      if (await wouldCreateCycle(input.id, input.newParentId, parentOf)) {
        throw new Error('folder move would create a cycle')
      }
      const [row] = await db.update(folders).set({ parentId: input.newParentId, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
        .returning()
      return row ?? null
    },
    async softDelete(input: { tenantId: string; id: string }) {
      await db.update(folders).set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(folders.id, input.id), eq(folders.tenantId, input.tenantId)))
    },
    async listForTenant(tenantId: string) {
      return db.select().from(folders)
        .where(and(eq(folders.tenantId, tenantId), eq(folders.isDeleted, false)))
    },
  }
}

export type FolderService = ReturnType<typeof createFolderService>
```

- [ ] **Step 11.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/folder-service.test.ts
git add packages/server
git commit -m "feat(server): FolderService (create/rename/move/softDelete/list) + cycle check"
```

---

## Task 12: `requireCapability` middleware

**Files:**
- Create: `packages/server/src/http/permission.ts`
- Create: `packages/server/test/unit/permission-middleware.test.ts`
- Modify: `packages/server/src/http/app.ts` (extend AppEnv.Variables with capabilities)

- [ ] **Step 12.1: Failing test**

Create `packages/server/test/unit/permission-middleware.test.ts`:

```ts
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireCapability } from '../../src/http/permission'
import type { PermissionAdapter } from '../../src/adapters/identity'

function appWith(permission: PermissionAdapter, capability: 'canView' | 'canEdit' | 'canShare' | 'canDelete') {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('deps' as never, { permission } as never)
    c.set('identity' as never, { tenantId: 't', userId: 'u' } as never)
    await next()
  })
  app.get(
    '/wb/:id',
    requireCapability(capability, (c) => ({
      type: 'workbook', id: c.req.param('id'),
      tenantId: c.get('identity' as never).tenantId,
    })) as never,
    (c) => c.json({ ok: true })
  )
  return app
}

describe('requireCapability', () => {
  it('passes when capability is true', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canView').request('/wb/abc')
    expect(res.status).toBe(200)
  })

  it('403 when capability is false', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: false, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canView').request('/wb/abc')
    expect(res.status).toBe(403)
  })

  it('500 when adapter throws', async () => {
    const permission: PermissionAdapter = {
      getCapabilities: async () => { throw new Error('exploded') },
      getMaskRules: async () => [],
    }
    const res = await appWith(permission, 'canEdit').request('/wb/x')
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 12.2: Implement**

Create `packages/server/src/http/permission.ts`:

```ts
import type { Context, MiddlewareHandler } from 'hono'
import type { AppEnv } from './app'
import type { Capability, ResourceRef } from '../adapters/types'

export type CapabilityName = keyof Capability

export function requireCapability(
  cap: CapabilityName,
  resourceOf: (c: Context<AppEnv>) => ResourceRef | Promise<ResourceRef>
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const identity = c.get('identity')
    if (!identity) return c.json({ error: 'unauthorized' }, 401)
    const deps = c.get('deps')
    try {
      const ref = await resourceOf(c)
      const capabilities = await deps.permission.getCapabilities(
        identity as Parameters<typeof deps.permission.getCapabilities>[0],
        ref
      )
      if (!capabilities[cap]) return c.json({ error: 'forbidden' }, 403)
      c.set('capabilities', capabilities)
      await next()
    } catch (err) {
      console.error('PermissionAdapter.getCapabilities failed:', err)
      return c.json({ error: 'permission check failed' }, 500)
    }
  }
}
```

Edit `packages/server/src/http/app.ts` — extend `AppEnv.Variables` to include `capabilities?: Capability`. Add `import type { Capability } from '../adapters/types'`.

- [ ] **Step 12.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/permission-middleware.test.ts
git add packages/server
git commit -m "feat(server): requireCapability middleware for per-route enforcement"
```

---

## Task 13: Folder CRUD endpoints

**Files:**
- Create: `packages/server/src/http/routes/folders.ts`
- Modify: `packages/server/src/http/app.ts` (services + route registration)
- Create: `packages/server/test/integration/folders.int.test.ts`

- [ ] **Step 13.1: Failing integration test**

Create `packages/server/test/integration/folders.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function buildAllowAll(tenantId: string) {
  const identity: IdentityAdapter = {
    resolveFromToken: async () => ({ tenantId, userId: 'u1' }),
  }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }
  return buildApp({
    db, identity, permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  })
}

describe('folders REST', () => {
  it('POST → LIST → PATCH rename → DELETE round-trip', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'folders-t' }).returning()
    const app = buildAllowAll(tenant.id)

    const post = await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Q1', parentId: null, spaceType: 'personal' }),
    })
    expect(post.status).toBe(201)
    const created = (await post.json()) as { id: string; name: string }
    expect(created.name).toBe('Q1')

    const list = await app.request('/api/v1/folders', { headers: { Authorization: 'Bearer x' } })
    const { items } = (await list.json()) as { items: { id: string }[] }
    expect(items.some((f) => f.id === created.id)).toBe(true)

    const rename = await app.request(`/api/v1/folders/${created.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Q1-2026' }),
    })
    expect(rename.status).toBe(200)

    const del = await app.request(`/api/v1/folders/${created.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })

  it('PATCH rejects move that creates a cycle', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'cycle' }).returning()
    const app = buildAllowAll(tenant.id)
    const a = (await (await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'a', parentId: null, spaceType: 'personal' }),
    })).json()) as { id: string }
    const b = (await (await app.request('/api/v1/folders', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'b', parentId: a.id, spaceType: 'personal' }),
    })).json()) as { id: string }
    const move = await app.request(`/api/v1/folders/${a.id}`, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ parentId: b.id }),
    })
    expect(move.status).toBe(400)
    expect(((await move.json()) as { error: string }).error).toMatch(/cycle/i)
  })
})
```

- [ ] **Step 13.2: Implement route**

Create `packages/server/src/http/routes/folders.ts`:

```ts
import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import type { AppEnv } from '../app'

export const foldersRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .get('/api/v1/folders', async (c) => {
    const id = c.get('identity')!
    let items = await c.get('services').folders.listForTenant(id.tenantId)
    const { permission } = c.get('deps')
    if (permission.filterListVisibility) {
      const filter = await permission.filterListVisibility(id, 'folders')
      if (filter.allowedIds !== undefined) {
        const set = new Set(filter.allowedIds)
        items = items.filter((f) => set.has(f.id))
      }
    }
    return c.json({ items })
  })
  .post('/api/v1/folders', async (c) => {
    const id = c.get('identity')!
    const body = (await c.req.json()) as {
      name?: string; parentId?: string | null; spaceType?: 'personal' | 'shared'
    }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    if (body.spaceType !== 'personal' && body.spaceType !== 'shared') {
      return c.json({ error: 'spaceType must be personal or shared' }, 400)
    }
    const created = await c.get('services').folders.create({
      tenantId: id.tenantId, userId: id.userId,
      name: body.name, parentId: body.parentId ?? null, spaceType: body.spaceType,
    })
    return c.json(created, 201)
  })
  .patch(
    '/api/v1/folders/:id',
    requireCapability('canEdit', (c) => ({
      type: 'folder', id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      const folderId = c.req.param('id')
      const body = (await c.req.json()) as { name?: string; parentId?: string | null }
      try {
        if (body.parentId !== undefined) {
          const moved = await c.get('services').folders.move({
            tenantId: id.tenantId, id: folderId, newParentId: body.parentId,
          })
          if (!moved) return c.json({ error: 'not found' }, 404)
          if (body.name === undefined) return c.json(moved)
        }
        if (body.name !== undefined) {
          const renamed = await c.get('services').folders.rename({
            tenantId: id.tenantId, id: folderId, name: body.name,
          })
          if (!renamed) return c.json({ error: 'not found' }, 404)
          return c.json(renamed)
        }
        return c.json({ error: 'nothing to update' }, 400)
      } catch (err) {
        if (err instanceof Error && /cycle/i.test(err.message)) {
          return c.json({ error: 'move would create a cycle' }, 400)
        }
        throw err
      }
    }
  )
  .delete(
    '/api/v1/folders/:id',
    requireCapability('canDelete', (c) => ({
      type: 'folder', id: c.req.param('id'),
      tenantId: c.get('identity')!.tenantId,
    })),
    async (c) => {
      const id = c.get('identity')!
      await c.get('services').folders.softDelete({ tenantId: id.tenantId, id: c.req.param('id') })
      return c.body(null, 204)
    }
  )
```

Edit `packages/server/src/http/app.ts`:
- Import `createFolderService` and `foldersRoute`
- Add `folders: createFolderService(db)` to `AppServices`
- Extend `AppServices` interface
- Add `app.route('/', foldersRoute)` after workbooks/snapshots routes

- [ ] **Step 13.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/folders.int.test.ts
git add packages/server
git commit -m "feat(server): /api/v1/folders LIST/POST/PATCH/DELETE with cycle check + capability checks"
```

---

## Task 14: Workbook/snapshot routes enforce capabilities

**Files:**
- Modify: `packages/server/src/http/routes/workbooks.ts`
- Modify: `packages/server/src/http/routes/snapshots.ts`
- Create: `packages/server/test/integration/workbooks-permission.int.test.ts`

- [ ] **Step 14.1: Failing test**

Create `packages/server/test/integration/workbooks-permission.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function buildWithPerm(tenantId: string, cap: Partial<{ canView: boolean; canEdit: boolean; canShare: boolean; canDelete: boolean }>) {
  const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId, userId: 'u1' }) }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({
      canView: false, canEdit: false, canShare: false, canDelete: false, ...cap,
    }),
    getMaskRules: async () => [],
  }
  return buildApp({
    db, identity, permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  })
}

describe('workbook + snapshot route permission enforcement', () => {
  it('403 GET workbook when canView is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p1' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const app = buildWithPerm(tenant.id, {})
    const res = await app.request(`/api/v1/workbooks/${wb.id}`, { headers: { Authorization: 'Bearer x' } })
    expect(res.status).toBe(403)
  })

  it('403 POST snapshot when canEdit is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p2' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const app = buildWithPerm(tenant.id, { canView: true })
    const res = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode('{}'),
    })
    expect(res.status).toBe(403)
  })

  it('403 DELETE workbook when canDelete is false', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'p3' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const app = buildWithPerm(tenant.id, { canView: true, canEdit: true })
    const res = await app.request(`/api/v1/workbooks/${wb.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer x' },
    })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 14.2: Add requireCapability to existing routes**

Edit `packages/server/src/http/routes/workbooks.ts`:
- `.get('/api/v1/workbooks/:id', requireCapability('canView', (c) => ({ type: 'workbook', id: c.req.param('id'), tenantId: c.get('identity')!.tenantId })), async (c) => { ... })`
- `.delete('/api/v1/workbooks/:id', requireCapability('canDelete', ...), async (c) => { ... })`

Edit `packages/server/src/http/routes/snapshots.ts`:
- POST snapshots: `requireCapability('canEdit', ...)`
- GET blob: `requireCapability('canView', ...)`
- GET latest snapshot: `requireCapability('canView', ...)`

- [ ] **Step 14.3: Run + commit**

```bash
pnpm --filter @ensemble/server test
git add packages/server
git commit -m "feat(server): enforce PermissionAdapter capabilities on workbook + snapshot routes"
```

---

## Task 15: Grants REST endpoints

**Files:**
- Create: `packages/server/src/http/routes/grants.ts`
- Modify: `packages/server/src/http/app.ts` (register)
- Create: `packages/server/test/integration/grants.int.test.ts`

- [ ] **Step 15.1: Failing test**

Create `packages/server/test/integration/grants.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('share grants REST', () => {
  it('POST creates grant; DELETE revokes', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-rest' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })

    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook', resourceId: wb.id,
        granteeType: 'user', granteeId: 'guest', permission: 'view',
      }),
    })
    expect(post.status).toBe(201)
    const grant = (await post.json()) as { id: string }
    const del = await app.request(`/api/v1/grants/${grant.id}`, {
      method: 'DELETE', headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
  })

  it('403 when caller lacks canShare', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'grants-403' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u1', name: 'wb' }).returning()
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const post = await app.request('/api/v1/grants', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({
        resourceType: 'workbook', resourceId: wb.id,
        granteeType: 'user', granteeId: 'guest', permission: 'view',
      }),
    })
    expect(post.status).toBe(403)
  })
})
```

- [ ] **Step 15.2: Implement**

Create `packages/server/src/http/routes/grants.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { requireIdentity } from '../auth'
import { requireCapability } from '../permission'
import { shareGrants } from '../../db/schema'
import type { AppEnv } from '../app'

type GrantBody = {
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId?: string
  permission: 'view' | 'edit' | 'manage'
  expiresAt?: string
}

export const grantsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  // Pre-middleware that parses the body and stashes it
  .use('/api/v1/grants', async (c, next) => {
    if (c.req.method === 'POST') {
      const body = (await c.req.json()) as GrantBody
      c.set('grantBody', body)
    }
    await next()
  })
  .post(
    '/api/v1/grants',
    requireCapability('canShare', (c) => {
      const body = c.get('grantBody')
      if (!body) throw new Error('grantBody missing')
      return { type: body.resourceType, id: body.resourceId, tenantId: c.get('identity')!.tenantId }
    }),
    async (c) => {
      const id = c.get('identity')!
      const body = c.get('grantBody')!
      const [row] = await c.get('deps').db.insert(shareGrants).values({
        tenantId: id.tenantId,
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        granteeType: body.granteeType,
        granteeId: body.granteeId ?? null,
        permission: body.permission,
        grantedBy: id.userId,
        ...(body.expiresAt ? { expiresAt: new Date(body.expiresAt) } : {}),
      }).returning()
      return c.json(row, 201)
    }
  )
  .delete('/api/v1/grants/:id', async (c) => {
    const idCtx = c.get('identity')!
    await c.get('deps').db.delete(shareGrants)
      .where(and(eq(shareGrants.id, c.req.param('id')), eq(shareGrants.tenantId, idCtx.tenantId)))
    return c.body(null, 204)
  })
```

Add `grantBody?: GrantBody` to `AppEnv.Variables`. Wire `grantsRoute` into `buildApp`.

- [ ] **Step 15.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/grants.int.test.ts
git add packages/server
git commit -m "feat(server): POST /grants + DELETE /grants/:id with canShare check"
```

---

## Task 16: filterListVisibility on workbook LIST

**Files:**
- Modify: `packages/server/src/http/routes/workbooks.ts` (LIST applies filter)
- Create: `packages/server/test/integration/list-filter.int.test.ts`

- [ ] **Step 16.1: Failing test**

Create `packages/server/test/integration/list-filter.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('filterListVisibility', () => {
  it('hides workbooks not in allowedIds', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'list-filter' }).returning()
    const [wb1] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'visible' }).returning()
    await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'hidden' })
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
      filterListVisibility: async (_id, scope) => scope === 'workbooks' ? { allowedIds: [wb1.id] } : {},
    }
    const app = buildApp({
      db, identity, permission,
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const res = await app.request('/api/v1/workbooks', { headers: { Authorization: 'Bearer x' } })
    const { items } = (await res.json()) as { items: { id: string }[] }
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(wb1.id)
  })
})
```

- [ ] **Step 16.2: Implement**

Edit `packages/server/src/http/routes/workbooks.ts` — replace LIST handler:

```ts
.get('/api/v1/workbooks', async (c) => {
  const id = c.get('identity')!
  const { permission } = c.get('deps')
  let all = await c.get('services').workbooks.listForTenant(id.tenantId)
  if (permission.filterListVisibility) {
    const filter = await permission.filterListVisibility(id, 'workbooks')
    if (filter.allowedIds !== undefined) {
      const set = new Set(filter.allowedIds)
      all = all.filter((w) => set.has(w.id))
    }
  }
  return c.json({ items: all })
})
```

- [ ] **Step 16.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/list-filter.int.test.ts
git add packages/server
git commit -m "feat(server): apply PermissionAdapter.filterListVisibility on workbooks LIST"
```

> **🟢 Milestone 4 checkpoint** — every read/write endpoint is now guarded.

---

# Milestone 5 — Snapshot masking

## Task 17: `applyMaskRules` pure function

**Files:**
- Create: `packages/server/src/services/mask-service.ts`
- Create: `packages/server/test/unit/mask-service.test.ts`

- [ ] **Step 17.1: Failing test**

Create `packages/server/test/unit/mask-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyMaskRules } from '../../src/services/mask-service'
import type { MaskRule } from '../../src/adapters/types'

function wb() {
  return {
    id: 'wb',
    sheetOrder: ['s1'],
    sheets: {
      s1: {
        id: 's1', name: 'Grades',
        cellData: {
          '0': { '0': { v: 'name' }, '1': { v: 'score' }, '2': { v: 'subject' } },
          '1': { '0': { v: 'Alice' }, '1': { v: 90 }, '2': { v: 'math' } },
          '2': { '0': { v: 'Bob' }, '1': { v: 85 }, '2': { v: 'physics' } },
        },
      },
    },
  }
}

describe('applyMaskRules', () => {
  it('column rule + redact', () => {
    const rules: MaskRule[] = [
      { match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: '***' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe('***')
    expect(out.sheets.s1.cellData['2']['1'].v).toBe('***')
    expect(out.sheets.s1.cellData['1']['0'].v).toBe('Alice')
  })

  it('header rule resolves column via row 0', () => {
    const rules: MaskRule[] = [
      { match: { type: 'header', sheet: 'Grades', headerText: 'score' }, action: { type: 'hash' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(typeof out.sheets.s1.cellData['1']['1'].v).toBe('string')
    expect(out.sheets.s1.cellData['1']['1'].v).toMatch(/^#[a-f0-9]{8}$/)
  })

  it('row rule + remove nulls cell values where predicate matches', () => {
    const rules: MaskRule[] = [
      { match: { type: 'row', sheet: '*', where: { field: 'subject', op: 'eq', value: 'math' } },
        action: { type: 'remove' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['0'].v).toBeNull()
    expect(out.sheets.s1.cellData['2']['0'].v).toBe('Bob')
  })

  it('non-existing header is a no-op', () => {
    const rules: MaskRule[] = [
      { match: { type: 'header', sheet: '*', headerText: 'nope' },
        action: { type: 'redact', replacement: 'X' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe(90)
  })

  it('sheet "*" applies to all sheets', () => {
    const data = wb()
    data.sheetOrder.push('s2')
    data.sheets.s2 = {
      id: 's2', name: 'Roster',
      cellData: { '0': { '0': { v: 'x' } } },
    }
    const rules: MaskRule[] = [
      { match: { type: 'column', sheet: '*', column: 'A' }, action: { type: 'redact', replacement: '_' } },
    ]
    const out = applyMaskRules(data, rules)
    expect(out.sheets.s1.cellData['0']['0'].v).toBe('_')
    expect(out.sheets.s2.cellData['0']['0'].v).toBe('_')
  })

  it('rules accumulate left-to-right', () => {
    const rules: MaskRule[] = [
      { match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: 'first' } },
      { match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: 'second' } },
    ]
    const out = applyMaskRules(wb(), rules)
    expect(out.sheets.s1.cellData['1']['1'].v).toBe('second')
  })
})
```

- [ ] **Step 17.2: Implement**

Create `packages/server/src/services/mask-service.ts`:

```ts
import { createHash } from 'node:crypto'
import type { MaskRule } from '../adapters/types'

export interface SheetData {
  id: string
  name: string
  cellData: Record<string, Record<string, { v?: unknown; m?: string }>>
}
export interface WorkbookData {
  id: string
  sheetOrder: string[]
  sheets: Record<string, SheetData>
}

function columnLetterToIndex(letter: string): number {
  let n = 0
  for (const ch of letter.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function maskCell(cell: { v?: unknown; m?: string }, action: MaskRule['action']): { v: unknown; m?: string } {
  if (cell.v === undefined || cell.v === null) return cell as { v: unknown }
  switch (action.type) {
    case 'redact': return { v: action.replacement }
    case 'hash': {
      const h = createHash('sha256').update(String(cell.v)).digest('hex').slice(0, 8)
      return { v: '#' + h }
    }
    case 'remove': return { v: null }
  }
}

function sheetMatches(rule: MaskRule['match'], sheet: SheetData): boolean {
  return rule.sheet === '*' || rule.sheet === sheet.name || rule.sheet === sheet.id
}

function headerColumnIndex(sheet: SheetData, headerText: string): number | null {
  const row0 = sheet.cellData['0']
  if (!row0) return null
  for (const colStr of Object.keys(row0)) {
    const cell = row0[colStr]
    if (cell && cell.v === headerText) return Number(colStr)
  }
  return null
}

function applyToSheet(sheet: SheetData, rule: MaskRule): void {
  if (!sheetMatches(rule.match, sheet)) return

  if (rule.match.type === 'column') {
    const colIdx = columnLetterToIndex(rule.match.column)
    for (const rowStr of Object.keys(sheet.cellData)) {
      if (rowStr === '0') continue
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const cell = row[String(colIdx)]
      if (cell) row[String(colIdx)] = maskCell(cell, rule.action)
    }
    return
  }

  if (rule.match.type === 'header') {
    const colIdx = headerColumnIndex(sheet, rule.match.headerText)
    if (colIdx === null) return
    for (const rowStr of Object.keys(sheet.cellData)) {
      if (rowStr === '0') continue
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const cell = row[String(colIdx)]
      if (cell) row[String(colIdx)] = maskCell(cell, rule.action)
    }
    return
  }

  if (rule.match.type === 'row') {
    const predicateColIdx = headerColumnIndex(sheet, rule.match.where.field)
    if (predicateColIdx === null) return
    for (const rowStr of Object.keys(sheet.cellData)) {
      if (rowStr === '0') continue
      const row = sheet.cellData[rowStr]
      if (!row) continue
      const predicateCell = row[String(predicateColIdx)]
      if (!predicateCell) continue
      const ok = rule.match.where.op === 'eq'
        ? predicateCell.v === rule.match.where.value
        : Array.isArray(rule.match.where.value) && rule.match.where.value.includes(predicateCell.v)
      if (!ok) continue
      for (const colStr of Object.keys(row)) {
        const cell = row[colStr]
        if (cell) row[colStr] = maskCell(cell, rule.action)
      }
    }
  }
}

export function applyMaskRules(workbook: WorkbookData, rules: MaskRule[]): WorkbookData {
  const clone: WorkbookData = JSON.parse(JSON.stringify(workbook))
  for (const sheetId of clone.sheetOrder) {
    const sheet = clone.sheets[sheetId]
    if (!sheet) continue
    for (const rule of rules) applyToSheet(sheet, rule)
  }
  return clone
}
```

- [ ] **Step 17.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/mask-service.test.ts
git add packages/server
git commit -m "feat(server): applyMaskRules — column/header/row × redact/hash/remove"
```

---

## Task 18: MaskRuleCache

**Files:**
- Modify: `packages/server/src/services/mask-service.ts` (append `MaskRuleCache` class)
- Modify: `packages/server/test/unit/mask-service.test.ts` (append tests)

- [ ] **Step 18.1: Append tests**

Append to `packages/server/test/unit/mask-service.test.ts`:

```ts
import { vi } from 'vitest'
import { MaskRuleCache } from '../../src/services/mask-service'

describe('MaskRuleCache', () => {
  it('caches by (userId, workbookId)', async () => {
    const fetcher = vi.fn(async (): Promise<MaskRule[]> => [
      { match: { type: 'column', sheet: '*', column: 'A' }, action: { type: 'remove' } },
    ])
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get('u1', 'wb1')
    await cache.get('u1', 'wb1')
    await cache.get('u2', 'wb1')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('expires after TTL', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async (): Promise<MaskRule[]> => [])
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get('u', 'wb')
    vi.advanceTimersByTime(60_001)
    await cache.get('u', 'wb')
    expect(fetcher).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('invalidate drops the entry', async () => {
    const fetcher = vi.fn(async (): Promise<MaskRule[]> => [])
    const cache = new MaskRuleCache(fetcher, 60_000)
    await cache.get('u', 'wb')
    cache.invalidate('u', 'wb')
    await cache.get('u', 'wb')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 18.2: Implement**

Append to `packages/server/src/services/mask-service.ts`:

```ts
export type MaskFetcher = (userId: string, workbookId: string) => Promise<MaskRule[]>

interface CacheEntry {
  rules: MaskRule[]
  expiresAt: number
}

export class MaskRuleCache {
  private map = new Map<string, CacheEntry>()
  private readonly ttlMs: number
  private readonly fetcher: MaskFetcher

  constructor(fetcher: MaskFetcher, ttlMs: number) {
    this.fetcher = fetcher
    this.ttlMs = ttlMs
  }

  async get(userId: string, workbookId: string): Promise<MaskRule[]> {
    const key = `${userId}::${workbookId}`
    const entry = this.map.get(key)
    if (entry && Date.now() < entry.expiresAt) return entry.rules
    const rules = await this.fetcher(userId, workbookId)
    this.map.set(key, { rules, expiresAt: Date.now() + this.ttlMs })
    return rules
  }

  invalidate(userId: string, workbookId: string): void {
    this.map.delete(`${userId}::${workbookId}`)
  }
}
```

- [ ] **Step 18.3: Run + commit**

```bash
pnpm --filter @ensemble/server test test/unit/mask-service.test.ts
git add packages/server
git commit -m "feat(server): MaskRuleCache per (userId, workbookId) with TTL + invalidate"
```

---

## Task 19: Wire mask into snapshot GET + WS welcome

**Files:**
- Modify: `packages/server/src/http/routes/snapshots.ts`
- Modify: `packages/server/src/ws/welcome.ts`
- Modify: `packages/server/src/http/app.ts` (instantiate MaskRuleCache in services)
- Create: `packages/server/test/integration/snapshot-masking.int.test.ts`

- [ ] **Step 19.1: Failing integration test**

Create `packages/server/test/integration/snapshot-masking.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { db } from './_dbHelpers'
import { tenants, workbooks } from '../../src/db/schema'
import { buildApp } from '../../src/http/app'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

describe('snapshot masking', () => {
  it('GET /workbooks/:id/snapshot applies mask rules', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'mask-1' }).returning()
    const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'u', name: 'wb' }).returning()
    const blobs = new Map<string, Uint8Array>()
    const storage = {
      put: async (k: string, b: Uint8Array) => { blobs.set(k, b) },
      get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => { blobs.delete(k) },
    }
    const identity: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u' }) }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [
        { match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: '***' } },
      ],
    }
    const app = buildApp({ db, identity, permission, storage, event: new NoopEventAdapter() })

    const raw = {
      id: wb.id,
      sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1', name: 'g',
          cellData: { '0': { '0': { v: 'a' }, '1': { v: 'b' } }, '1': { '0': { v: 1 }, '1': { v: 999 } } },
        },
      },
    }
    await app.request(`/api/v1/workbooks/${wb.id}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(raw)),
    })

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const data = (await get.json()) as typeof raw
    expect(data.sheets.s1.cellData['1']['1'].v).toBe('***')
    expect(data.sheets.s1.cellData['1']['0'].v).toBe(1)
  })
})
```

- [ ] **Step 19.2: Wire mask into snapshot route**

Edit `packages/server/src/http/routes/snapshots.ts` — replace `.get('/api/v1/workbooks/:wbId/snapshot', ...)`:

```ts
.get(
  '/api/v1/workbooks/:wbId/snapshot',
  requireCapability('canView', (c) => ({
    type: 'workbook', id: c.req.param('wbId'),
    tenantId: c.get('identity')!.tenantId,
  })),
  async (c) => {
    const { storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const wb = await c.get('services').workbooks.get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await c.get('services').snapshots.getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await storage.get(snap.storageKey)
    const data = JSON.parse(new TextDecoder().decode(bytes)) as Parameters<typeof applyMaskRules>[0]
    const rules = await c.get('services').masks.get(idCtx.userId, wb.id)
    return c.json(applyMaskRules(data, rules))
  }
)
```

Add `import { applyMaskRules } from '../../services/mask-service'`. Apply the same mask in `.get('/api/v1/workbooks/:wbId/snapshots/:id/blob', ...)`.

- [ ] **Step 19.3: Instantiate MaskRuleCache in buildApp**

Edit `packages/server/src/http/app.ts`:

```ts
const services: AppServices = {
  workbooks: createWorkbookService(db),
  snapshots: createSnapshotService(db, deps.storage),
  folders: createFolderService(db),
  masks: new MaskRuleCache(
    (userId, workbookId) =>
      deps.permission.getMaskRules(
        { tenantId: deps /* see fix below */ } as never,
        { type: 'workbook', id: workbookId, tenantId: '' /* will be set at fetch time */ }
      ),
    60_000
  ),
}
```

**Note**: This sketched constructor doesn't have tenantId at construction. Refactor so `MaskRuleCache.get(userId, workbookId, tenantId?)` receives tenant at call time, or instantiate the cache per-request. The simpler choice: instantiate **per request** by computing tenant from identity. To avoid that overhead, change `MaskFetcher` signature to `(identity, workbook) => Promise<MaskRule[]>` and the cache key to include identity tenant. Pick whichever the spec reviewer prefers; for this plan, **change MaskFetcher to take identity + workbookId** so cache is constructed once but fetcher receives both.

Simplest working implementation:

```ts
// In mask-service.ts:
export type MaskFetcher = (identity: IdentityContext, workbookId: string) => Promise<MaskRule[]>

// In buildApp:
masks: new MaskRuleCache(
  (identity, workbookId) =>
    deps.permission.getMaskRules(identity, { type: 'workbook', id: workbookId, tenantId: identity.tenantId }),
  60_000
)

// In route handler:
const rules = await c.get('services').masks.get(idCtx, wb.id)
```

Update `MaskRuleCache.get` and tests accordingly.

Extend `AppServices` interface with `masks: MaskRuleCache`.

- [ ] **Step 19.4: Wire into WS welcome**

Edit `packages/server/src/ws/welcome.ts` — after fetching snapshot, apply mask:

```ts
const rawJson = snap ? new TextDecoder().decode(await deps.storage.get(snap.storageKey)) : null
let snapshotPayload: unknown = null
if (rawJson) {
  const rules = await deps.permission.getMaskRules(
    { tenantId: ctx.tenantId, userId: ctx.userId },
    { type: 'workbook', id: wb.id, tenantId: ctx.tenantId }
  )
  snapshotPayload = applyMaskRules(JSON.parse(rawJson), rules)
}
ws.send(JSON.stringify({
  type: 'welcome', workbookId: wb.id, seqNum: 0,
  snapshot: snapshotPayload, presence: [], locks: [],
}))
```

Add the import.

- [ ] **Step 19.5: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/snapshot-masking.int.test.ts
pnpm --filter @ensemble/server test
git add packages/server
git commit -m "feat(server): apply mask rules on snapshot GET + WS welcome egress"
```

---

## Task 20: WS welcome mask integration test

**Files:**
- Modify: `packages/server/test/integration/ws-welcome.int.test.ts` (append mask case)

- [ ] **Step 20.1: Append test**

Append to `packages/server/test/integration/ws-welcome.int.test.ts`:

```ts
it('welcome snapshot is masked per recipient', async () => {
  const [tenant] = await db.insert(tenants).values({ name: 'ws-mask' }).returning()
  const [wb] = await db.insert(workbooks).values({ tenantId: tenant.id, ownerId: 'owner', name: 'WB' }).returning()
  const identity: IdentityAdapter = {
    resolveFromToken: async (t) => {
      if (t !== 'ok') throw new Error('bad')
      return { tenantId: tenant.id, userId: 'viewer' }
    },
  }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
    getMaskRules: async () => [
      { match: { type: 'column', sheet: '*', column: 'A' }, action: { type: 'redact', replacement: '***' } },
    ],
  }
  const memBlobs = new Map<string, Uint8Array>()
  const wbData = {
    id: wb.id, sheetOrder: ['s1'],
    sheets: { s1: { id: 's1', name: 's', cellData: { '0': { '0': { v: 'header' } }, '1': { '0': { v: 'secret' } } } } },
  }
  const key = 'ws-mask-key'
  memBlobs.set(key, new TextEncoder().encode(JSON.stringify(wbData)))
  await db.execute(sql`
    INSERT INTO snapshots (workbook_id, storage_key, size_bytes, created_by, reason)
    VALUES (${wb.id}, ${key}, 0, 'owner', 'manual')
  `)

  const storage = {
    put: async (k: string, b: Uint8Array) => { memBlobs.set(k, b) },
    get: async (k: string) => memBlobs.get(k) ?? new Uint8Array(),
    delete: async (k: string) => { memBlobs.delete(k) },
  }
  const handle = await createServer({
    databaseUrl: dbUrl, identity, permission, storage, event: new NoopEventAdapter(),
  }).listen({ port: 0 })
  const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
  const frame: { snapshot: { sheets: { s1: { cellData: Record<string, Record<string, { v?: unknown }>> } } } } =
    await new Promise((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())))
      ws.once('error', reject)
    })
  expect(frame.snapshot.sheets.s1.cellData['1']['0'].v).toBe('***')
  ws.close()
  await handle.close()
})
```

Add `import { sql } from 'drizzle-orm'` if missing.

- [ ] **Step 20.2: Run + commit**

```bash
pnpm --filter @ensemble/server test test/integration/ws-welcome.int.test.ts
git add packages/server
git commit -m "test(server): WS welcome applies per-recipient mask rules"
```

> **🟢 Milestone 5 checkpoint** — masking lands on both snapshot REST egress and WS welcome.

---

# Milestone 6 — Frontend + Demo + e2e

## Task 21: Core API client — folders + grants

**Files:**
- Modify: `packages/core/src/api-client.ts`
- Modify: `packages/core/src/types.ts` (Folder, Grant)
- Modify: `packages/core/test/api-client.test.ts`

- [ ] **Step 21.1: Add types**

Append to `packages/core/src/types.ts`:

```ts
export interface Folder {
  id: string
  tenantId: string
  parentId: string | null
  name: string
  ownerId: string
  spaceType: 'personal' | 'shared'
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface Grant {
  id: string
  tenantId: string
  resourceType: 'folder' | 'workbook'
  resourceId: string
  granteeType: 'user' | 'tenant_member' | 'public_link'
  granteeId: string | null
  permission: 'view' | 'edit' | 'manage'
  expiresAt: string | null
  grantedBy: string
  grantedAt: string
}
```

- [ ] **Step 21.2: Failing test**

Append to `packages/core/test/api-client.test.ts`:

```ts
describe('ApiClient folders + grants', () => {
  it('listFolders / createFolder / renameFolder / moveFolder / deleteFolder', async () => {
    let lastReq: { method: string; url: string; body?: unknown } | null = null
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      lastReq = { method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined }
      if (init?.method === 'POST')   return new Response(JSON.stringify({ id: 'f1', name: 'F' }), { status: 201 })
      if (init?.method === 'PATCH')  return new Response(JSON.stringify({ id: 'f1', name: 'F2' }), { status: 200 })
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response(JSON.stringify({ items: [{ id: 'f1' }] }), { status: 200 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    expect((await api.listFolders()).items).toEqual([{ id: 'f1' }])
    await api.createFolder({ name: 'F', parentId: null, spaceType: 'personal' })
    expect(lastReq?.body).toEqual({ name: 'F', parentId: null, spaceType: 'personal' })
    await api.renameFolder('f1', 'F2')
    expect(lastReq?.body).toEqual({ name: 'F2' })
    await api.moveFolder('f1', 'parent2')
    expect(lastReq?.body).toEqual({ parentId: 'parent2' })
    await api.deleteFolder('f1')
    expect(lastReq?.method).toBe('DELETE')
  })

  it('createGrant / deleteGrant', async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'g1' }), { status: 201 })
      return new Response(null, { status: 204 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const g = await api.createGrant({
      resourceType: 'workbook', resourceId: 'wb',
      granteeType: 'user', granteeId: 'u2', permission: 'view',
      expiresAt: null,
    })
    expect(g.id).toBe('g1')
    await api.deleteGrant('g1')
  })
})
```

- [ ] **Step 21.3: Implement**

Append to `packages/core/src/api-client.ts`:

```ts
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
```

Add `Folder, Grant` to the imports at top of `api-client.ts`.

- [ ] **Step 21.4: Run + commit**

```bash
pnpm --filter @ensemble/core test
git add packages/core
git commit -m "feat(core): ApiClient folders + grants methods"
```

---

## Task 22: `<FolderNavigator />` React

**Files:**
- Create: `packages/react/src/FolderNavigator.tsx`
- Modify: `packages/react/src/index.ts`
- Create: `packages/react/test/FolderNavigator.test.tsx`

- [ ] **Step 22.1: Failing test**

Create `packages/react/test/FolderNavigator.test.tsx`:

```tsx
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderNavigator } from '../src/FolderNavigator'
import type { Folder } from '@ensemble/core'

function makeApi(initial: Folder[]) {
  let items = initial
  return {
    listFolders: vi.fn(async () => ({ items })),
    createFolder: vi.fn(async (input: { name: string; parentId: string | null; spaceType: 'personal' | 'shared' }) => {
      const f: Folder = {
        id: 'new-' + items.length, tenantId: 't',
        parentId: input.parentId, name: input.name, ownerId: 'u',
        spaceType: input.spaceType, isDeleted: false, createdAt: '', updatedAt: '',
      }
      items = [...items, f]
      return f
    }),
    deleteFolder: vi.fn(async (id: string) => { items = items.filter((f) => f.id !== id) }),
    renameFolder: vi.fn(async () => items[0]),
    moveFolder: vi.fn(async () => items[0]),
  }
}

describe('<FolderNavigator />', () => {
  it('renders root folders fetched from api.listFolders', async () => {
    const api = makeApi([
      { id: 'a', tenantId: 't', parentId: null, name: 'Personal', ownerId: 'u', spaceType: 'personal', isDeleted: false, createdAt: '', updatedAt: '' },
      { id: 'b', tenantId: 't', parentId: null, name: 'Shared', ownerId: 'u', spaceType: 'shared', isDeleted: false, createdAt: '', updatedAt: '' },
    ])
    const { findByText } = render(<FolderNavigator api={api as never} onSelect={() => {}} />)
    await findByText('Personal')
    await findByText('Shared')
  })

  it('clicking + creates a folder under root', async () => {
    const api = makeApi([])
    const { getByLabelText, findByText } = render(<FolderNavigator api={api as never} onSelect={() => {}} />)
    fireEvent.click(getByLabelText('Create folder'))
    const input = getByLabelText('Folder name')
    fireEvent.change(input, { target: { value: 'New' } })
    fireEvent.submit(input.closest('form')!)
    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith({ name: 'New', parentId: null, spaceType: 'personal' })
    )
    await findByText('New')
  })
})
```

- [ ] **Step 22.2: Implement**

Create `packages/react/src/FolderNavigator.tsx`:

```tsx
import type { ApiClient, Folder } from '@ensemble/core'
import { useCallback, useEffect, useState } from 'react'

export interface FolderNavigatorProps {
  api: Pick<ApiClient, 'listFolders' | 'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder'>
  onSelect: (folder: Folder) => void
}

export function FolderNavigator({ api, onSelect }: FolderNavigatorProps) {
  const [folders, setFolders] = useState<Folder[]>([])
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')

  const refresh = useCallback(async () => {
    const { items } = await api.listFolders()
    setFolders(items.filter((f) => !f.isDeleted))
  }, [api])

  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className="ensemble-folder-navigator">
      <header style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <strong>Folders</strong>
        <button aria-label="Create folder" onClick={() => setCreating(true)}>+</button>
      </header>
      {creating && (
        <form onSubmit={async (e) => {
          e.preventDefault()
          if (!draftName.trim()) return
          await api.createFolder({ name: draftName, parentId: null, spaceType: 'personal' })
          setCreating(false); setDraftName('')
          await refresh()
        }}>
          <input aria-label="Folder name" value={draftName}
            onChange={(e) => setDraftName(e.target.value)} autoFocus />
        </form>
      )}
      <ul>
        {folders.filter((f) => f.parentId === null).map((f) => (
          <li key={f.id}>
            <button onClick={() => onSelect(f)}>{f.name}</button>
            <span style={{ marginLeft: 8, fontSize: '0.85em', color: '#888' }}>{f.spaceType}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

Edit `packages/react/src/index.ts` to add `export { FolderNavigator, type FolderNavigatorProps } from './FolderNavigator'`.

- [ ] **Step 22.3: Run + commit**

```bash
pnpm --filter @ensemble/react test
git add packages/react
git commit -m "feat(react): <FolderNavigator /> component"
```

---

## Task 23: `<FolderNavigator />` Vue

**Files:**
- Create: `packages/vue/src/FolderNavigator.vue`
- Modify: `packages/vue/src/index.ts`
- Create: `packages/vue/test/FolderNavigator.test.ts`

- [ ] **Step 23.1: Failing test**

Create `packages/vue/test/FolderNavigator.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import FolderNavigator from '../src/FolderNavigator.vue'

const makeApi = (initial: { id: string; name: string; parentId: string | null; spaceType: string; isDeleted: boolean }[] = []) => {
  let items = initial
  return {
    listFolders: vi.fn(async () => ({ items })),
    createFolder: vi.fn(async (input: { name: string; parentId: string | null; spaceType: 'personal' | 'shared' }) => {
      const f = { id: 'n' + items.length, ...input, ownerId: 'u', isDeleted: false }
      items = [...items, f as never]
      return f
    }),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
  }
}

describe('<FolderNavigator /> Vue', () => {
  it('renders fetched folders', async () => {
    const api = makeApi([
      { id: 'a', name: 'Personal', parentId: null, spaceType: 'personal', isDeleted: false },
    ])
    const wrapper = mount(FolderNavigator, { props: { api, onSelect: () => {} } })
    await new Promise((r) => setTimeout(r, 0))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Personal')
  })

  it('creates a folder on form submit', async () => {
    const api = makeApi()
    const wrapper = mount(FolderNavigator, { props: { api, onSelect: () => {} } })
    await wrapper.vm.$nextTick()
    await wrapper.find('[aria-label="Create folder"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('input[aria-label="Folder name"]').setValue('New')
    await wrapper.find('form').trigger('submit.prevent')
    expect(api.createFolder).toHaveBeenCalled()
  })
})
```

- [ ] **Step 23.2: Implement**

Create `packages/vue/src/FolderNavigator.vue`:

```vue
<script setup lang="ts">
import type { ApiClient, Folder } from '@ensemble/core'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  api: Pick<ApiClient, 'listFolders' | 'createFolder' | 'renameFolder' | 'moveFolder' | 'deleteFolder'>
  onSelect: (folder: Folder) => void
}>()

const folders = ref<Folder[]>([])
const creating = ref(false)
const draftName = ref('')

async function refresh() {
  const { items } = await props.api.listFolders()
  folders.value = items.filter((f) => !f.isDeleted)
}

async function submit() {
  if (!draftName.value.trim()) return
  await props.api.createFolder({ name: draftName.value, parentId: null, spaceType: 'personal' })
  creating.value = false
  draftName.value = ''
  await refresh()
}

onMounted(refresh)
</script>

<template>
  <div class="ensemble-folder-navigator">
    <header style="display: flex; align-items: center; gap: 8px">
      <strong>Folders</strong>
      <button aria-label="Create folder" @click="creating = true">+</button>
    </header>
    <form v-if="creating" @submit.prevent="submit">
      <input v-model="draftName" aria-label="Folder name" autofocus />
    </form>
    <ul>
      <li v-for="f in folders.filter((x) => x.parentId === null)" :key="f.id">
        <button @click="props.onSelect(f)">{{ f.name }}</button>
        <span style="margin-left: 8px; font-size: 0.85em; color: #888">{{ f.spaceType }}</span>
      </li>
    </ul>
  </div>
</template>
```

Edit `packages/vue/src/index.ts` to also export `FolderNavigator`.

- [ ] **Step 23.3: Run + commit**

```bash
pnpm --filter @ensemble/vue test
git add packages/vue
git commit -m "feat(vue): <FolderNavigator /> SFC"
```

---

## Task 24: Demo two-pane masked view

**Files:**
- Modify: `apps/demo/src/server-runner.ts`
- Modify: `apps/demo/src/main.tsx`
- Create: `apps/demo/e2e/two-users-masked.spec.ts`

- [ ] **Step 24.1: Real PermissionAdapter in demo**

Edit `apps/demo/src/server-runner.ts` — replace the trivial `permission`:

```ts
const permission: PermissionAdapter = {
  getCapabilities: async (identity) => {
    if (identity.userId === 'admin')
      return { canView: true, canEdit: true, canShare: true, canDelete: true }
    if (identity.userId === 'viewer')
      return { canView: true, canEdit: false, canShare: false, canDelete: false }
    return { canView: false, canEdit: false, canShare: false, canDelete: false }
  },
  getMaskRules: async (identity) => {
    if (identity.userId === 'viewer') {
      return [{ match: { type: 'column', sheet: '*', column: 'B' }, action: { type: 'redact', replacement: '***' } }]
    }
    return []
  },
}
```

- [ ] **Step 24.2: Two-pane UI**

Edit `apps/demo/src/main.tsx`:

```tsx
import { WorkbookEditor } from '@ensemble/react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function Pane({ userId }: { userId: string }) {
  const [wbId, setWbId] = useState<string | null>(localStorage.getItem('wbId-shared'))
  useEffect(() => {
    if (wbId) return
    void fetch('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: `Bearer dev:${userId}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Shared Demo' }),
    })
      .then((r) => r.json())
      .then((wb: { id: string }) => {
        localStorage.setItem('wbId-shared', wb.id)
        setWbId(wb.id)
      })
  }, [wbId, userId])
  if (!wbId) return <div style={{ padding: 16 }}>loading {userId}…</div>
  return (
    <div style={{ flex: 1, height: '100%', borderRight: '1px solid #eee' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #eee', fontWeight: 600 }}>
        user: <code>{userId}</code>
      </div>
      <WorkbookEditor
        workbookId={wbId}
        apiBaseUrl=""
        wsBaseUrl={location.origin.replace('http', 'ws')}
        token={() => `dev:${userId}`}
        onReady={(h) => {
          ;(window as unknown as Record<string, unknown>)[`ensembleSave_${userId}`] = () => h.save()
        }}
      />
    </div>
  )
}

function App() {
  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <Pane userId="admin" />
      <Pane userId="viewer" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```

- [ ] **Step 24.3: Playwright e2e**

Create `apps/demo/e2e/two-users-masked.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
})

test('admin sees raw value, viewer sees mask', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('code').filter({ hasText: 'admin' })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('code').filter({ hasText: 'viewer' })).toBeVisible()
  await page.waitForFunction(() => !!localStorage.getItem('wbId-shared'), { timeout: 30_000 })
  const wbId = await page.evaluate(() => localStorage.getItem('wbId-shared'))
  expect(wbId).toBeTruthy()

  await page.evaluate(async (wb) => {
    const payload = {
      id: wb, sheetOrder: ['s1'],
      sheets: {
        s1: {
          id: 's1', name: 'Grades',
          cellData: {
            '0': { '0': { v: 'name' }, '1': { v: 'score' } },
            '1': { '0': { v: 'Alice' }, '1': { v: 90 } },
          },
        },
      },
    }
    const res = await fetch(`/api/v1/workbooks/${wb}/snapshots?reason=manual`, {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:admin', 'content-type': 'application/json' },
      body: new TextEncoder().encode(JSON.stringify(payload)),
    })
    if (!res.ok) throw new Error('save failed')
  }, wbId)

  const adminValue = await page.evaluate(async (wb) => {
    const r = await fetch(`/api/v1/workbooks/${wb}/snapshot`, {
      headers: { Authorization: 'Bearer dev:admin' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['1']?.['1']?.v
  }, wbId)
  expect(adminValue).toBe(90)

  const viewerValue = await page.evaluate(async (wb) => {
    const r = await fetch(`/api/v1/workbooks/${wb}/snapshot`, {
      headers: { Authorization: 'Bearer dev:viewer' },
    })
    const d = (await r.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    return Object.values(d.sheets)[0]?.cellData['1']?.['1']?.v
  }, wbId)
  expect(viewerValue).toBe('***')
})
```

- [ ] **Step 24.4: Run + commit**

```bash
export DATABASE_URL=postgres://postgres:postgres@localhost:5432/ensemble_dev
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/server exec node dist/db/migrate.js
pnpm -r build
pnpm --filter @ensemble/demo e2e
git add apps/demo
git commit -m "feat(demo): two-pane masked-view e2e proving per-user mask divergence"
```

---

## Task 25: Docs + ADR + Sprint 2 status

**Files:**
- Modify: `README.md`
- Create: `docs/decisions/0001-rls-vs-app-level-tenancy.md`

- [ ] **Step 25.1: Update README status**

Edit `README.md` — change status line to:

```
Status: Sprint 2 ("Permission + Folder") complete. Multi-tenant with Postgres RLS, JWKS identity, per-route capability enforcement, folder CRUD with cycle prevention, share grants with ancestor walk, and per-recipient snapshot masking. Sprint 3 (real-time collaboration) next.
```

Add `@ensemble/identity-jwks` to the package table.

- [ ] **Step 25.2: First ADR**

Create `docs/decisions/0001-rls-vs-app-level-tenancy.md`:

```markdown
# ADR 0001 — Postgres RLS vs application-level tenancy

**Status**: accepted (Sprint 2)

**Context**: Spec §4 lockin requires structural impossibility of cross-tenant
data leaks. Two main approaches:
- App-level: every query helper takes `tenantId` and includes it in WHERE
- RLS: Postgres enforces tenant boundary; application sets `app.tenant_id`
  inside transactions

**Decision**: RLS, supplemented by `withTenant(tenantId, fn)` helper that
runs each request inside a transaction with `SET LOCAL app.tenant_id`.

**Consequences**:
- Defence-in-depth: even a buggy query helper that forgets `tenantId`
  cannot see other tenants — Postgres rejects the rows.
- Test fixtures need superuser BYPASSRLS to seed cross-tenant data
  (`_globalSetup.ts` does this).
- All writes go through transactions; small per-request overhead.
- Bulk admin tools need an explicit "BYPASSRLS" admin role.
```

- [ ] **Step 25.3: Commit**

```bash
git add README.md docs/decisions
git commit -m "docs: Sprint 2 status + ADR 0001 (RLS choice)"
```

> **🟢 Milestone 6 checkpoint — Sprint 2 done.** Final `pnpm -r test --coverage && pnpm -r build`.

---

## Self-Review

**1. Spec §9 Sprint 2 coverage**:
- ✅ Multi-tenant: every table has `tenant_id`, RLS → T1, T2, T3, T7
- ✅ `IdentityAdapter` first impl: `@ensemble/identity-jwks` → T4-T6
- ✅ `PermissionAdapter` enforced on every endpoint → T12, T14, T16
- ✅ Folder CRUD → T11, T13
- ✅ Share grants table + resolution with ancestor walk → T7, T8, T9, T10, T15
- ✅ Frontend folder navigator (Vue + React) → T22, T23
- ✅ Snapshot masking → T17, T18, T19, T20
- ✅ Integration tests with Testcontainers → throughout
- ✅ Demo: two users see different masked views → T24

**2. Placeholder scan** — clean. Grants-route body-caching uses a pre-middleware that stashes parsed body to a typed `grantBody` slot. Mask fetcher signature change documented in T19.

**3. Type consistency**: `Capability`, `IdentityContext`, `ResourceRef`, `MaskRule`, `Grant`, `Folder` defined once each. `MaskRuleCache` constructor takes `(identity, workbookId) => Promise<MaskRule[]>` consistently across T18-T20.

**4. Known gotchas**:
- Drizzle-kit does not emit RLS migrations; handwritten `0002_rls.sql` + `0004_rls_share_grants.sql`, with `_journal.json` appended manually.
- `_globalSetup.ts` must `ALTER USER postgres BYPASSRLS` so fixtures can seed cross-tenant.
- Postgres `set_config('app.tenant_id', uuid, true)` — `true` scopes to transaction.
- Univer-keyboard e2e from Sprint 1 stays `test.fixme`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-sprint2-permission-folder.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review. 25 tasks across 6 milestones.

**2. Inline Execution** — execute in this session using executing-plans, batch with milestone checkpoints.

**Which approach?**
