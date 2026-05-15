# Sprint 1 — "It opens" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the ensemble monorepo and deliver an end-to-end **single-user** workbook editor: open a `.xlsx` in the browser, edit it, save a snapshot to storage (FS or S3), reload, see the edit. No collab, no masking, no permissions yet — but every adapter interface, every package boundary, and every test harness used in later sprints lands here.

**Architecture:** pnpm-workspaces monorepo. Backend = Hono on Node + Drizzle + Postgres + adapter pattern (Identity / Permission / Storage / Event). Frontend = `@ensemble/core` vanilla TS (Univer + SheetJS + REST + WS-welcome) with thin `@ensemble/react` and `@ensemble/vue` wrappers. Storage adapters: local FS (dev) and S3 (prod-ish). `WebhookAdapter` proves the non-Node host path. Tests use Vitest + Testcontainers (Postgres) + Playwright (e2e smoke).

**Tech Stack:** Node 20+, pnpm 9, TypeScript 5.5 (strict), Hono 4, Drizzle ORM, postgres-js, `@hono/node-server`, `@hono/node-ws`, Univer OSS, SheetJS (`xlsx`), Vitest, `@testcontainers/postgresql`, Playwright, Biome, Changesets, AWS SDK v3 (`@aws-sdk/client-s3`).

**Spec reference:** `docs/specs/2026-05-15-ensemble-design.md` (§9 Sprint 1, §3 architecture, §4 data model, §5 adapter contracts).

---

## Conventions used in this plan

- **Working directory** for all commands: repo root `/Users/cedric/Projects.localized/ensemble` unless a step says otherwise.
- **Coverage target**: 90%+ lines for `@ensemble/core` and `@ensemble/server`. Verify with `pnpm -r test --coverage` at each TDD checkpoint.
- **Commits**: small and frequent. After every `Step: Commit` checkbox you should have a green test suite for everything written so far.
- **TDD discipline**: every behavior-changing task starts with a *failing* test, runs it red, then implements minimally, runs it green, then commits. Skim/type-only edits (configs, package.json) don't need a failing-test step but do need a verification step.
- **Conformance suite preview**: Sprint 1 lays the seams for the adapter-conformance test package that Sprint 2 fills in. Don't ship it yet; just keep contracts clean.
- **Naming**: package directories under `packages/` use unscoped folder names (`core`, `server`, `react`, `vue`, `storage-s3`, `storage-fs`, `webhook`). Their `package.json` `name` field is the scoped form (`@ensemble/core`, etc.).

---

## File / package structure created in this sprint

```
ensemble/
├── package.json                            (root, private, pnpm workspaces)
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── vitest.workspace.ts
├── .changeset/config.json
├── .github/workflows/ci.yml
├── packages/
│   ├── core/                              @ensemble/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts                   public exports
│   │   │   ├── api-client.ts              REST client
│   │   │   ├── ws-client.ts               connect + welcome only
│   │   │   ├── univer-wrapper.ts          createEditor()
│   │   │   ├── xlsx-converter.ts          SheetJS ↔ Univer JSON
│   │   │   └── types.ts                   shared TS types
│   │   └── test/
│   │       ├── api-client.test.ts
│   │       ├── ws-client.test.ts
│   │       ├── xlsx-converter.test.ts
│   │       └── univer-wrapper.test.ts
│   ├── server/                            @ensemble/server
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── drizzle.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                   exports + createServer
│   │   │   ├── adapters/
│   │   │   │   ├── identity.ts            IdentityAdapter interface + NotImplemented
│   │   │   │   ├── permission.ts          PermissionAdapter interface + NotImplemented
│   │   │   │   ├── storage.ts             StorageAdapter interface
│   │   │   │   ├── event.ts               EventAdapter interface + Noop
│   │   │   │   └── types.ts               IdentityContext, ResourceRef, Capability, MaskRule, EnsembleEvent
│   │   │   ├── db/
│   │   │   │   ├── schema.ts              Drizzle table defs
│   │   │   │   ├── client.ts              postgres-js + drizzle factory
│   │   │   │   └── migrate.ts             CLI entry
│   │   │   ├── http/
│   │   │   │   ├── app.ts                 buildApp(deps) -> Hono
│   │   │   │   ├── routes/
│   │   │   │   │   ├── health.ts
│   │   │   │   │   ├── workbooks.ts       POST/GET/LIST/DELETE
│   │   │   │   │   └── snapshots.ts       POST + GET
│   │   │   │   └── auth.ts                JWT extraction → IdentityAdapter
│   │   │   ├── ws/
│   │   │   │   └── welcome.ts             upgrade + welcome frame, then idle
│   │   │   ├── services/
│   │   │   │   ├── workbook-service.ts
│   │   │   │   └── snapshot-service.ts
│   │   │   └── server.ts                  createServer({ ... }) factory
│   │   ├── drizzle/
│   │   │   └── 0001_init.sql              generated migration (committed)
│   │   └── test/
│   │       ├── unit/
│   │       │   ├── workbook-service.test.ts
│   │       │   ├── snapshot-service.test.ts
│   │       │   ├── adapters-shape.test.ts
│   │       │   └── auth.test.ts
│   │       └── integration/
│   │           ├── _setup.ts              Testcontainers Postgres bootstrap
│   │           ├── workbooks.int.test.ts
│   │           ├── snapshots.int.test.ts
│   │           └── ws-welcome.int.test.ts
│   ├── react/                             @ensemble/react
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   ├── src/WorkbookEditor.tsx
│   │   └── test/WorkbookEditor.test.tsx
│   ├── vue/                               @ensemble/vue
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   ├── src/WorkbookEditor.vue
│   │   └── test/WorkbookEditor.test.ts
│   ├── storage-fs/                        @ensemble/storage-fs
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   └── test/storage-fs.test.ts
│   ├── storage-s3/                        @ensemble/storage-s3
│   │   ├── package.json
│   │   ├── src/index.ts
│   │   └── test/storage-s3.test.ts        uses LocalStack via Testcontainers
│   └── webhook/                           @ensemble/webhook
│       ├── package.json
│       ├── src/index.ts                   WebhookAdapter (identity + permission + event)
│       └── test/webhook.test.ts
└── apps/
    └── demo/                              Vite app, mounts <WorkbookEditor>
        ├── package.json
        ├── vite.config.ts
        ├── index.html
        ├── src/main.tsx
        └── e2e/
            ├── playwright.config.ts
            └── open-edit-save-reload.spec.ts
```

---

## Milestones (review checkpoints)

| Milestone | Tasks       | What's green at the end |
|-----------|-------------|-------------------------|
| **M1**    | T1 – T3     | Monorepo builds, lints, tests (empty), CI passes |
| **M2**    | T4 – T7     | DB schema migrates, adapter contracts compile, Hono app starts |
| **M3**    | T8 – T11    | Workbook + Snapshot REST work against real Postgres (Testcontainers) |
| **M4**    | T12 – T15   | Storage-FS, Storage-S3, Webhook adapter all conformance-pass |
| **M5**    | T16 – T19   | `@ensemble/core` opens an xlsx, talks REST, gets WS welcome |
| **M6**    | T20 – T22   | Demo app: open → edit → save → reload (Playwright e2e green) |

After **each milestone**: review checkpoint — run `pnpm -r build && pnpm -r test --coverage` and confirm overall coverage ≥90% on `core`+`server`. If below, write the missing tests *before* moving on.

---

# Milestone 1 — Monorepo Foundation

## Task 1: Initialize pnpm workspace + TypeScript strict baseline

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`

- [ ] **Step 1.1: Pin Node version**

Create `.nvmrc`:

```
20.17.0
```

- [ ] **Step 1.2: Add `.gitignore`**

Create `.gitignore`:

```
node_modules/
dist/
coverage/
.turbo/
.DS_Store
*.log
.env
.env.local
playwright-report/
test-results/
.vite/
```

- [ ] **Step 1.3: Root `package.json`**

Create `package.json`:

```json
{
  "name": "ensemble",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.17" },
  "scripts": {
    "build": "pnpm -r --filter='./packages/*' build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "pnpm -r --filter='./packages/*' typecheck",
    "changeset": "changeset"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "@changesets/cli": "2.27.9",
    "@vitest/coverage-v8": "2.1.4",
    "typescript": "5.5.4",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 1.4: Workspace declaration**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 1.5: Strict TS base config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true
  },
  "exclude": ["node_modules", "dist", "coverage"]
}
```

- [ ] **Step 1.6: Install + verify**

Run:

```bash
corepack enable
pnpm install
node --version          # should print v20.x
pnpm --version          # should print 9.x
pnpm typecheck || true  # no packages yet, exit 0 is fine
```

Expected: no install errors. `pnpm-lock.yaml` appears.

- [ ] **Step 1.7: Commit**

```bash
git add .gitignore .nvmrc package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace with strict TS"
```

---

## Task 2: Biome + Vitest + Changesets baseline

**Files:**
- Create: `biome.json`
- Create: `vitest.workspace.ts`
- Create: `.changeset/config.json`

- [ ] **Step 2.1: Biome config (lint + format)**

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignore": ["dist", "coverage", "drizzle", "**/*.generated.ts"] },
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": { "noExplicitAny": "error" },
      "style": { "useImportType": "error", "useNodejsImportProtocol": "error" }
    }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
}
```

- [ ] **Step 2.2: Vitest workspace**

Create `vitest.workspace.ts`:

```ts
export default [
  'packages/core',
  'packages/server',
  'packages/react',
  'packages/vue',
  'packages/storage-fs',
  'packages/storage-s3',
  'packages/webhook',
]
```

- [ ] **Step 2.3: Changesets init**

Run:

```bash
pnpm changeset init
```

Edit the generated `.changeset/config.json`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [["@ensemble/*"]],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["@ensemble/demo"]
}
```

- [ ] **Step 2.4: Sanity-check lint + test runners**

Run:

```bash
pnpm lint
pnpm test
```

Expected: both exit 0.

- [ ] **Step 2.5: Commit**

```bash
git add biome.json vitest.workspace.ts .changeset
git commit -m "chore: add biome, vitest workspace, changesets"
```

---

## Task 3: CI skeleton

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 3.1: Write CI workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: ci
on:
  push: { branches: [main] }
  pull_request:
jobs:
  build-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: ensemble_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/ensemble_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version-file: '.nvmrc', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
      - run: pnpm test --coverage
```

- [ ] **Step 3.2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint+typecheck+build+test workflow"
```

> **🟢 Milestone 1 checkpoint** — push to a feature branch and watch CI go green. Empty test suites are fine. Don't proceed until CI is green.

---

# Milestone 2 — Adapter contracts + DB schema

## Task 4: Server package skeleton + adapter contracts (types only)

**Files:**
- Create: `packages/server/package.json`
- Create: `packages/server/tsconfig.json`
- Create: `packages/server/src/index.ts`
- Create: `packages/server/src/adapters/types.ts`
- Create: `packages/server/src/adapters/identity.ts`
- Create: `packages/server/src/adapters/permission.ts`
- Create: `packages/server/src/adapters/storage.ts`
- Create: `packages/server/src/adapters/event.ts`
- Create: `packages/server/test/unit/adapters-shape.test.ts`

- [ ] **Step 4.1: Package manifest**

Create `packages/server/package.json`:

```json
{
  "name": "@ensemble/server",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist", "drizzle"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "node --enable-source-maps ./dist/db/migrate.js"
  },
  "dependencies": {
    "hono": "4.6.5",
    "@hono/node-server": "1.13.2",
    "@hono/node-ws": "1.0.4",
    "drizzle-orm": "0.36.0",
    "postgres": "3.4.4",
    "jose": "5.9.6",
    "ws": "8.18.0"
  },
  "devDependencies": {
    "@types/node": "20.16.10",
    "@types/ws": "8.5.12",
    "drizzle-kit": "0.27.0",
    "@testcontainers/postgresql": "10.13.2"
  }
}
```

- [ ] **Step 4.2: TS config**

Create `packages/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4.3: Write failing adapter shape test**

Create `packages/server/test/unit/adapters-shape.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from '../../src/adapters/identity'
import type {
  IdentityAdapter,
  PermissionAdapter,
  StorageAdapter,
  EventAdapter,
} from '../../src/index'

describe('adapter contracts', () => {
  it('NotImplementedIdentityAdapter rejects when called', async () => {
    const a: IdentityAdapter = new NotImplementedIdentityAdapter()
    await expect(a.resolveFromToken('x')).rejects.toThrow(/not implemented/i)
  })

  it('NotImplementedPermissionAdapter rejects on getCapabilities', async () => {
    const a: PermissionAdapter = new NotImplementedPermissionAdapter()
    await expect(
      a.getCapabilities({ tenantId: 't', userId: 'u' }, { type: 'workbook', id: 'w', tenantId: 't' })
    ).rejects.toThrow(/not implemented/i)
  })

  it('NoopEventAdapter resolves silently', async () => {
    const a: EventAdapter = new NoopEventAdapter()
    await expect(
      a.publish({ type: 'workbook.opened', workbookId: 'w', userId: 'u', at: new Date().toISOString() })
    ).resolves.toBeUndefined()
  })

  it('StorageAdapter type accepts minimal duck', () => {
    const fake: StorageAdapter = {
      put: async () => {},
      get: async () => new Uint8Array(),
      delete: async () => {},
    }
    expect(fake.put).toBeTypeOf('function')
  })
})
```

- [ ] **Step 4.4: Run — expect fail (module not found)**

```bash
pnpm --filter @ensemble/server test
```

Expected: FAIL.

- [ ] **Step 4.5: Define types**

Create `packages/server/src/adapters/types.ts`:

```ts
export interface IdentityContext {
  tenantId: string
  userId: string
  displayName?: string
  email?: string
  roles?: string[]
  custom?: Record<string, unknown>
}

export interface ResourceRef {
  type: 'folder' | 'workbook'
  id: string
  tenantId: string
}

export interface Capability {
  canView: boolean
  canEdit: boolean
  canShare: boolean
  canDelete: boolean
}

export type MaskMatch =
  | { type: 'column'; sheet: '*' | string; column: string }
  | { type: 'header'; sheet: '*' | string; headerText: string }
  | { type: 'row'; sheet: '*' | string; where: { field: string; op: 'eq' | 'in'; value: unknown } }

export type MaskAction =
  | { type: 'redact'; replacement: string }
  | { type: 'hash' }
  | { type: 'remove' }

export interface MaskRule {
  match: MaskMatch
  action: MaskAction
}

export type EnsembleEvent =
  | { type: 'workbook.created'; workbookId: string; userId: string; at: string }
  | { type: 'workbook.opened';  workbookId: string; userId: string; at: string }
  | { type: 'workbook.edited';  workbookId: string; userId: string; batchedOpsCount: number; at: string }
  | { type: 'folder.created';   folderId: string;   userId: string; at: string }
  | { type: 'share.granted';    grantId: string;    grantedBy: string; at: string }
```

- [ ] **Step 4.6: Identity + Event adapter (with NotImplemented + Noop)**

Create `packages/server/src/adapters/identity.ts`:

```ts
import type { EnsembleEvent, IdentityContext, ResourceRef, Capability, MaskRule } from './types'

export interface IdentityAdapter {
  resolveFromToken(token: string): Promise<IdentityContext>
}

export class NotImplementedIdentityAdapter implements IdentityAdapter {
  resolveFromToken(_token: string): Promise<IdentityContext> {
    return Promise.reject(new Error('IdentityAdapter not implemented'))
  }
}

export interface PermissionAdapter {
  getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability>
  getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]>
  filterListVisibility?(
    identity: IdentityContext,
    scope: 'folders' | 'workbooks'
  ): Promise<{ allowedIds?: string[] }>
}

export class NotImplementedPermissionAdapter implements PermissionAdapter {
  getCapabilities(): Promise<Capability> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
  getMaskRules(): Promise<MaskRule[]> {
    return Promise.reject(new Error('PermissionAdapter not implemented'))
  }
}

export interface EventAdapter {
  publish(event: EnsembleEvent): Promise<void>
}

export class NoopEventAdapter implements EventAdapter {
  async publish(_event: EnsembleEvent): Promise<void> {}
}
```

- [ ] **Step 4.7: Permission + Storage adapter file scaffolds**

Create `packages/server/src/adapters/permission.ts`:

```ts
export { type PermissionAdapter, NotImplementedPermissionAdapter } from './identity'
```

Create `packages/server/src/adapters/storage.ts`:

```ts
export interface StorageAdapter {
  put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void>
  get(key: string): Promise<Uint8Array>
  delete(key: string): Promise<void>
  signedPutUrl?(key: string, ttlSec?: number): Promise<string>
  signedGetUrl?(key: string, ttlSec?: number, filename?: string): Promise<string>
}
```

Create `packages/server/src/adapters/event.ts`:

```ts
export { type EventAdapter, NoopEventAdapter } from './identity'
```

- [ ] **Step 4.8: Public exports**

Create `packages/server/src/index.ts`:

```ts
export * from './adapters/types'
export type { IdentityAdapter, PermissionAdapter, EventAdapter } from './adapters/identity'
export {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from './adapters/identity'
export type { StorageAdapter } from './adapters/storage'
```

- [ ] **Step 4.9: Run — expect pass**

```bash
pnpm install
pnpm --filter @ensemble/server test
```

Expected: 4/4 pass.

- [ ] **Step 4.10: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): adapter contracts (Identity/Permission/Storage/Event)"
```

---

## Task 5: Drizzle schema + migration (tenants/folders/workbooks/snapshots)

> Sprint 1 needs tenants/workbooks/snapshots wired into queries. We define the full Sprint-1-bound DDL now (tenants/folders/workbooks/snapshots) but skip `mutations` and `share_grants` (Sprints 2-3). Including `folders` keeps FK from `workbooks.folder_id` honest.

**Files:**
- Create: `packages/server/src/db/schema.ts`
- Create: `packages/server/src/db/client.ts`
- Create: `packages/server/src/db/migrate.ts`
- Create: `packages/server/drizzle.config.ts`
- Generate: `packages/server/drizzle/0001_init.sql`
- Create: `packages/server/test/integration/_setup.ts`
- Create: `packages/server/vitest.config.ts`
- Create: `packages/server/test/integration/migration.int.test.ts`

- [ ] **Step 5.1: Drizzle schema**

Create `packages/server/src/db/schema.ts`:

```ts
import { boolean, pgEnum, pgTable, text, timestamp, uuid, bigint } from 'drizzle-orm/pg-core'

export const spaceType = pgEnum('space_type', ['personal', 'shared'])
export const snapshotReason = pgEnum('snapshot_reason', ['auto', 'manual', 'named'])

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const folders = pgTable('folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  parentId: uuid('parent_id'),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  spaceType: spaceType('space_type').notNull(),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workbooks = pgTable('workbooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  folderId: uuid('folder_id').references(() => folders.id),
  name: text('name').notNull(),
  ownerId: text('owner_id').notNull(),
  currentSnapshotId: uuid('current_snapshot_id'),
  isDeleted: boolean('is_deleted').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const snapshots = pgTable('snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  workbookId: uuid('workbook_id').notNull().references(() => workbooks.id),
  storageKey: text('storage_key').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reason: snapshotReason('reason').notNull().default('auto'),
  name: text('name'),
})
```

- [ ] **Step 5.2: Drizzle config**

Create `packages/server/drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://localhost/ensemble_dev' },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 5.3: DB client factory**

Create `packages/server/src/db/client.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export type Database = ReturnType<typeof createDb>

export function createDb(url: string) {
  const sql = postgres(url, { max: 10 })
  return drizzle(sql, { schema })
}
```

- [ ] **Step 5.4: Migration runner**

Create `packages/server/src/db/migrate.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}
const sql = postgres(url, { max: 1 })
await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
await sql.end()
console.log('migrations applied')
```

- [ ] **Step 5.5: Generate the SQL migration**

```bash
pnpm --filter @ensemble/server exec drizzle-kit generate
```

Expected: file `packages/server/drizzle/0001_init.sql` (or similar suffix) is created. Commit it as-is.

- [ ] **Step 5.6: Testcontainers integration bootstrap**

Create `packages/server/test/integration/_setup.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { afterAll, beforeAll } from 'vitest'
import { createDb, type Database } from '../../src/db/client'

let container: StartedPostgreSqlContainer
export let db: Database
export let dbUrl: string

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start()
  dbUrl = container.getConnectionUri()
  const sql = postgres(dbUrl, { max: 1 })
  await migrate(drizzle(sql), { migrationsFolder: './drizzle' })
  await sql.end()
  db = createDb(dbUrl)
}, 60_000)

afterAll(async () => {
  await container?.stop()
}, 30_000)
```

- [ ] **Step 5.7: Vitest config**

Create `packages/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/unit/**/*.test.ts', 'test/integration/**/*.int.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
    setupFiles: ['./test/integration/_setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
```

- [ ] **Step 5.8: Write the migration-smokes-up integration test**

Create `packages/server/test/integration/migration.int.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from './_setup'

describe('migration', () => {
  it('creates the core tables', async () => {
    const rows = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `)
    const names = rows.map((r) => r.table_name as string)
    expect(names).toEqual(expect.arrayContaining(['tenants', 'folders', 'workbooks', 'snapshots']))
  })
})
```

- [ ] **Step 5.9: Run integration test**

```bash
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/server test
```

Expected: 5 tests pass (4 adapter shape + 1 migration smoke). Requires Docker running.

- [ ] **Step 5.10: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "feat(server): drizzle schema + migration for tenants/folders/workbooks/snapshots"
```

---

## Task 6: Hono app builder + health endpoint

**Files:**
- Create: `packages/server/src/http/app.ts`
- Create: `packages/server/src/http/routes/health.ts`
- Create: `packages/server/test/integration/health.int.test.ts`

- [ ] **Step 6.1: Failing test**

Create `packages/server/test/integration/health.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_setup'
import {
  NotImplementedIdentityAdapter,
  NotImplementedPermissionAdapter,
  NoopEventAdapter,
} from '../../src/adapters/identity'

describe('GET /healthz', () => {
  it('returns ok json', async () => {
    const app = buildApp({
      db,
      identity: new NotImplementedIdentityAdapter(),
      permission: new NotImplementedPermissionAdapter(),
      storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
      event: new NoopEventAdapter(),
    })
    const res = await app.request('/healthz')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })
})
```

Run: `pnpm --filter @ensemble/server test test/integration/health.int.test.ts` → expect FAIL.

- [ ] **Step 6.2: Health route**

Create `packages/server/src/http/routes/health.ts`:

```ts
import { Hono } from 'hono'

export const healthRoute = new Hono().get('/healthz', (c) => c.json({ ok: true }))
```

- [ ] **Step 6.3: App builder**

Create `packages/server/src/http/app.ts`:

```ts
import { Hono } from 'hono'
import type { Database } from '../db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from '../adapters/identity'
import type { StorageAdapter } from '../adapters/storage'
import { healthRoute } from './routes/health'

export interface AppDeps {
  db: Database
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
}

export type AppEnv = { Variables: { deps: AppDeps; identity?: { tenantId: string; userId: string } } }

export function buildApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    await next()
  })
  app.route('/', healthRoute)
  return app
}
```

- [ ] **Step 6.4: Re-run test — expect pass**

```bash
pnpm --filter @ensemble/server test test/integration/health.int.test.ts
```

Expected: 1/1 PASS.

- [ ] **Step 6.5: Commit**

```bash
git add packages/server
git commit -m "feat(server): hono app builder with health endpoint"
```

---

## Task 7: JWT extraction middleware (calls IdentityAdapter)

**Files:**
- Create: `packages/server/src/http/auth.ts`
- Create: `packages/server/test/unit/auth.test.ts`

- [ ] **Step 7.1: Failing test**

Create `packages/server/test/unit/auth.test.ts`:

```ts
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { requireIdentity } from '../../src/http/auth'
import type { IdentityAdapter } from '../../src/adapters/identity'

function appWith(identity: IdentityAdapter) {
  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('deps' as never, { identity } as never)
    await next()
  })
  app.use('*', requireIdentity)
  app.get('/me', (c) => c.json(c.get('identity' as never)))
  return app
}

describe('requireIdentity', () => {
  const fakeOk: IdentityAdapter = {
    resolveFromToken: async (t) =>
      t === 'good' ? { tenantId: 't1', userId: 'u1' } : Promise.reject(new Error('bad')),
  }

  it('401 without Authorization header', async () => {
    const res = await appWith(fakeOk).request('/me')
    expect(res.status).toBe(401)
  })

  it('401 when adapter rejects', async () => {
    const res = await appWith(fakeOk).request('/me', { headers: { Authorization: 'Bearer bad' } })
    expect(res.status).toBe(401)
  })

  it('passes identity through on success', async () => {
    const res = await appWith(fakeOk).request('/me', { headers: { Authorization: 'Bearer good' } })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tenantId: 't1', userId: 'u1' })
  })
})
```

Run: expect FAIL.

- [ ] **Step 7.2: Implement middleware**

Create `packages/server/src/http/auth.ts`:

```ts
import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from './app'

export const requireIdentity: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) return c.json({ error: 'unauthorized' }, 401)
  const token = header.slice('Bearer '.length).trim()
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  try {
    const id = await c.get('deps').identity.resolveFromToken(token)
    c.set('identity', { tenantId: id.tenantId, userId: id.userId })
    await next()
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
}
```

- [ ] **Step 7.3: Run — expect pass**

```bash
pnpm --filter @ensemble/server test test/unit/auth.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 7.4: Commit**

```bash
git add packages/server
git commit -m "feat(server): requireIdentity middleware backed by IdentityAdapter"
```

> **🟢 Milestone 2 checkpoint** — `pnpm -r test --coverage` from repo root. Coverage threshold may not yet be met since most code is plumbing; that's expected, we'll catch up in M3.

---

# Milestone 3 — Workbook + Snapshot REST

## Task 8: WorkbookService (pure logic, unit tests first)

**Files:**
- Create: `packages/server/src/services/workbook-service.ts`
- Create: `packages/server/test/unit/workbook-service.test.ts`

- [ ] **Step 8.1: Failing unit test (uses a stub db via dependency injection)**

Create `packages/server/test/unit/workbook-service.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createWorkbookService } from '../../src/services/workbook-service'

function stubDb() {
  const rows: Record<string, unknown>[] = []
  return {
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          const row = { id: 'wb_' + (rows.length + 1), isDeleted: false, ...v }
          rows.push(row)
          return [row]
        },
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => rows.filter((r) => !(r as { isDeleted: boolean }).isDeleted) }),
      }),
    }),
    update: () => ({ set: (s: object) => ({ where: async () => { rows.forEach((r) => Object.assign(r, s)) } }) }),
    _rows: rows,
  }
}

describe('WorkbookService', () => {
  it('creates a workbook owned by the requesting user', async () => {
    const db = stubDb()
    const svc = createWorkbookService(db as never)
    const wb = await svc.create({ tenantId: 't1', userId: 'u1', name: 'Q1 Grades' })
    expect(wb).toMatchObject({ name: 'Q1 Grades', ownerId: 'u1', tenantId: 't1' })
  })

  it('soft-deletes', async () => {
    const db = stubDb()
    const svc = createWorkbookService(db as never)
    const wb = await svc.create({ tenantId: 't1', userId: 'u1', name: 'x' })
    await svc.softDelete({ tenantId: 't1', id: wb.id })
    expect((db._rows[0] as { isDeleted: boolean }).isDeleted).toBe(true)
  })
})
```

Run: expect FAIL.

- [ ] **Step 8.2: Implement service**

Create `packages/server/src/services/workbook-service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import { workbooks } from '../db/schema'

export interface CreateInput { tenantId: string; userId: string; name: string; folderId?: string }
export interface RefInput { tenantId: string; id: string }

export function createWorkbookService(db: Database) {
  return {
    async create(input: CreateInput) {
      const [row] = await db
        .insert(workbooks)
        .values({
          tenantId: input.tenantId,
          ownerId: input.userId,
          name: input.name,
          folderId: input.folderId,
        })
        .returning()
      return row
    },
    async get(input: RefInput) {
      const rows = await db
        .select()
        .from(workbooks)
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId), eq(workbooks.isDeleted, false)))
        .limit(1)
      return rows[0] ?? null
    },
    async listForTenant(tenantId: string) {
      return db
        .select()
        .from(workbooks)
        .where(and(eq(workbooks.tenantId, tenantId), eq(workbooks.isDeleted, false)))
    },
    async softDelete(input: RefInput) {
      await db
        .update(workbooks)
        .set({ isDeleted: true, updatedAt: new Date() })
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
    },
    async setCurrentSnapshot(input: RefInput & { snapshotId: string }) {
      await db
        .update(workbooks)
        .set({ currentSnapshotId: input.snapshotId, updatedAt: new Date() })
        .where(and(eq(workbooks.id, input.id), eq(workbooks.tenantId, input.tenantId)))
    },
  }
}

export type WorkbookService = ReturnType<typeof createWorkbookService>
```

- [ ] **Step 8.3: Run — expect pass**

```bash
pnpm --filter @ensemble/server test test/unit/workbook-service.test.ts
```

Expected: 2/2 PASS.

- [ ] **Step 8.4: Commit**

```bash
git add packages/server
git commit -m "feat(server): WorkbookService (create/get/list/softDelete)"
```

---

## Task 9: Workbook REST endpoints (integration test)

**Files:**
- Create: `packages/server/src/http/routes/workbooks.ts`
- Modify: `packages/server/src/http/app.ts` (register route)
- Create: `packages/server/test/integration/workbooks.int.test.ts`

- [ ] **Step 9.1: Failing integration test**

Create `packages/server/test/integration/workbooks.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_setup'
import { tenants } from '../../src/db/schema'
import { NoopEventAdapter } from '../../src/adapters/identity'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'

function deps(identity: IdentityAdapter) {
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }
  return {
    db,
    identity,
    permission,
    storage: { put: async () => {}, get: async () => new Uint8Array(), delete: async () => {} },
    event: new NoopEventAdapter(),
  }
}

describe('workbooks REST', () => {
  it('POST creates and GET returns the workbook', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'acme' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const app = buildApp(deps(identity))

    const created = await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grades' }),
    })
    expect(created.status).toBe(201)
    const wb = (await created.json()) as { id: string; name: string }
    expect(wb.name).toBe('Grades')

    const got = await app.request(`/api/v1/workbooks/${wb.id}`, { headers: { Authorization: 'Bearer x' } })
    expect(got.status).toBe(200)
    expect(((await got.json()) as { id: string }).id).toBe(wb.id)
  })

  it('LIST returns only my tenant', async () => {
    const [a] = await db.insert(tenants).values({ name: 't-a' }).returning()
    const [b] = await db.insert(tenants).values({ name: 't-b' }).returning()
    const idA: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: a.id, userId: 'u1' }) }
    const idB: IdentityAdapter = { resolveFromToken: async () => ({ tenantId: b.id, userId: 'u2' }) }
    const appA = buildApp(deps(idA))
    const appB = buildApp(deps(idB))
    await appA.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'A-only' }),
    })
    const list = await appB.request('/api/v1/workbooks', { headers: { Authorization: 'Bearer x' } })
    const items = (await list.json()) as { items: unknown[] }
    expect(items.items.length).toBe(0)
  })

  it('DELETE soft-deletes and subsequent GET returns 404', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'del' }).returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const app = buildApp(deps(identity))
    const created = await app.request('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'doomed' }),
    })
    const wb = (await created.json()) as { id: string }
    const del = await app.request(`/api/v1/workbooks/${wb.id}`, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer x' },
    })
    expect(del.status).toBe(204)
    const got = await app.request(`/api/v1/workbooks/${wb.id}`, { headers: { Authorization: 'Bearer x' } })
    expect(got.status).toBe(404)
  })
})
```

Run: expect FAIL.

- [ ] **Step 9.2: Implement route**

Create `packages/server/src/http/routes/workbooks.ts`:

```ts
import { Hono } from 'hono'
import { createWorkbookService } from '../../services/workbook-service'
import { requireIdentity } from '../auth'
import type { AppEnv } from '../app'

export const workbooksRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const body = (await c.req.json()) as { name?: string; folderId?: string }
    if (!body.name) return c.json({ error: 'name required' }, 400)
    const svc = createWorkbookService(db)
    const wb = await svc.create({ tenantId: id.tenantId, userId: id.userId, name: body.name, folderId: body.folderId })
    return c.json(wb, 201)
  })
  .get('/api/v1/workbooks', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const items = await createWorkbookService(db).listForTenant(id.tenantId)
    return c.json({ items })
  })
  .get('/api/v1/workbooks/:id', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: id.tenantId, id: c.req.param('id') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    return c.json(wb)
  })
  .delete('/api/v1/workbooks/:id', async (c) => {
    const { db } = c.get('deps')
    const id = c.get('identity')!
    await createWorkbookService(db).softDelete({ tenantId: id.tenantId, id: c.req.param('id') })
    return c.body(null, 204)
  })
```

- [ ] **Step 9.3: Register route**

Edit `packages/server/src/http/app.ts` — add import at top and append `app.route('/', workbooksRoute)` after the existing `app.route('/', healthRoute)`:

```ts
import { workbooksRoute } from './routes/workbooks'
// ...
  app.route('/', workbooksRoute)
```

- [ ] **Step 9.4: Run — expect pass**

```bash
pnpm --filter @ensemble/server test test/integration/workbooks.int.test.ts
```

Expected: 3/3 PASS.

- [ ] **Step 9.5: Commit**

```bash
git add packages/server
git commit -m "feat(server): /api/v1/workbooks CRUD endpoints"
```

---

## Task 10: SnapshotService + REST endpoints

**Files:**
- Create: `packages/server/src/services/snapshot-service.ts`
- Create: `packages/server/src/http/routes/snapshots.ts`
- Modify: `packages/server/src/http/app.ts` (register route)
- Create: `packages/server/test/unit/snapshot-service.test.ts`
- Create: `packages/server/test/integration/snapshots.int.test.ts`

- [ ] **Step 10.1: Failing unit test**

Create `packages/server/test/unit/snapshot-service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotService } from '../../src/services/snapshot-service'

const fakeStorage = {
  put: vi.fn(async () => {}),
  get: vi.fn(async () => new TextEncoder().encode('{"hello":"world"}')),
  delete: vi.fn(async () => {}),
}

const dbStub = {
  _snapshots: [] as Record<string, unknown>[],
  insert() {
    const self = this
    return {
      values(v: Record<string, unknown>) {
        return {
          async returning() {
            const row = { id: 'snap_' + (self._snapshots.length + 1), ...v }
            self._snapshots.push(row)
            return [row]
          },
        }
      },
    }
  },
  select() { return { from: () => ({ where: () => ({ limit: async () => this._snapshots }) }) } },
}

describe('SnapshotService', () => {
  it('puts blob and inserts row with size', async () => {
    const svc = createSnapshotService(dbStub as never, fakeStorage)
    const body = new TextEncoder().encode('{"a":1}')
    const snap = await svc.create({ tenantId: 't', workbookId: 'wb', userId: 'u', body, reason: 'manual' })
    expect(fakeStorage.put).toHaveBeenCalledTimes(1)
    expect(snap.sizeBytes).toBe(body.byteLength)
    expect(snap.workbookId).toBe('wb')
  })
})
```

Run: expect FAIL.

- [ ] **Step 10.2: Implement service**

Create `packages/server/src/services/snapshot-service.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm'
import type { Database } from '../db/client'
import type { StorageAdapter } from '../adapters/storage'
import { snapshots } from '../db/schema'

export interface CreateSnapshotInput {
  tenantId: string
  workbookId: string
  userId: string
  body: Uint8Array
  reason: 'auto' | 'manual' | 'named'
  name?: string
}

export function createSnapshotService(db: Database, storage: StorageAdapter) {
  return {
    async create(input: CreateSnapshotInput) {
      const key = `tenants/${input.tenantId}/workbooks/${input.workbookId}/${Date.now()}-${crypto.randomUUID()}.json`
      await storage.put(key, input.body, { contentType: 'application/json' })
      const [row] = await db
        .insert(snapshots)
        .values({
          workbookId: input.workbookId,
          storageKey: key,
          sizeBytes: input.body.byteLength,
          createdBy: input.userId,
          reason: input.reason,
          name: input.name,
        })
        .returning()
      return row
    },
    async getById(id: string) {
      const rows = await db.select().from(snapshots).where(eq(snapshots.id, id)).limit(1)
      return rows[0] ?? null
    },
    async getLatest(workbookId: string) {
      const rows = await db
        .select()
        .from(snapshots)
        .where(eq(snapshots.workbookId, workbookId))
        .orderBy(desc(snapshots.createdAt))
        .limit(1)
      return rows[0] ?? null
    },
  }
}
```

- [ ] **Step 10.3: Failing integration test**

Create `packages/server/test/integration/snapshots.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../../src/http/app'
import { db } from './_setup'
import { tenants, workbooks } from '../../src/db/schema'
import { NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '../../src/adapters/identity'

function memStorage() {
  const blobs = new Map<string, Uint8Array>()
  return {
    storage: {
      put: async (k: string, b: Uint8Array) => { blobs.set(k, b) },
      get: async (k: string) => blobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => { blobs.delete(k) },
    },
    blobs,
  }
}

describe('snapshots REST', () => {
  it('POST creates snapshot, GET returns the bytes back', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'snap-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB' })
      .returning()

    const ms = memStorage()
    const identity: IdentityAdapter = {
      resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
      getMaskRules: async () => [],
    }
    const app = buildApp({ db, identity, permission, storage: ms.storage, event: new NoopEventAdapter() })

    const payload = new TextEncoder().encode('{"sheets":{}}')
    const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
      method: 'POST',
      headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
      body: payload,
    })
    expect(post.status).toBe(201)
    const snap = (await post.json()) as { id: string }

    const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshots/${snap.id}/blob`, {
      headers: { Authorization: 'Bearer x' },
    })
    expect(get.status).toBe(200)
    const body = new Uint8Array(await get.arrayBuffer())
    expect(new TextDecoder().decode(body)).toBe('{"sheets":{}}')
  })
})
```

Run: expect FAIL.

- [ ] **Step 10.4: Implement route**

Create `packages/server/src/http/routes/snapshots.ts`:

```ts
import { Hono } from 'hono'
import { createSnapshotService } from '../../services/snapshot-service'
import { createWorkbookService } from '../../services/workbook-service'
import { requireIdentity } from '../auth'
import type { AppEnv } from '../app'

export const snapshotsRoute = new Hono<AppEnv>()
  .use('*', requireIdentity)
  .post('/api/v1/workbooks/:wbId/snapshots', async (c) => {
    const { db, storage } = c.get('deps')
    const id = c.get('identity')!
    const wbId = c.req.param('wbId')
    const wb = await createWorkbookService(db).get({ tenantId: id.tenantId, id: wbId })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const body = new Uint8Array(await c.req.arrayBuffer())
    if (body.byteLength === 0) return c.json({ error: 'empty body' }, 400)
    const reason = (c.req.query('reason') ?? 'manual') as 'auto' | 'manual' | 'named'
    const name = c.req.query('name') ?? undefined
    const snap = await createSnapshotService(db, storage).create({
      tenantId: id.tenantId,
      workbookId: wbId,
      userId: id.userId,
      body,
      reason,
      name,
    })
    await createWorkbookService(db).setCurrentSnapshot({ tenantId: id.tenantId, id: wbId, snapshotId: snap.id })
    return c.json(snap, 201)
  })
  .get('/api/v1/workbooks/:wbId/snapshots/:id/blob', async (c) => {
    const { db, storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await createSnapshotService(db, storage).getById(c.req.param('id'))
    if (!snap) return c.json({ error: 'not found' }, 404)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
  .get('/api/v1/workbooks/:wbId/snapshot', async (c) => {
    const { db, storage } = c.get('deps')
    const idCtx = c.get('identity')!
    const wb = await createWorkbookService(db).get({ tenantId: idCtx.tenantId, id: c.req.param('wbId') })
    if (!wb) return c.json({ error: 'not found' }, 404)
    const snap = await createSnapshotService(db, storage).getLatest(wb.id)
    if (!snap) return c.body(null, 204)
    const bytes = await storage.get(snap.storageKey)
    return c.body(bytes, 200, { 'content-type': 'application/json' })
  })
```

- [ ] **Step 10.5: Register route**

Edit `packages/server/src/http/app.ts` — add import and route call:

```ts
import { snapshotsRoute } from './routes/snapshots'
// ...
  app.route('/', snapshotsRoute)
```

- [ ] **Step 10.6: Run — expect pass**

```bash
pnpm --filter @ensemble/server test
```

Expected: all tests so far PASS.

- [ ] **Step 10.7: Commit**

```bash
git add packages/server
git commit -m "feat(server): SnapshotService + /api/v1/workbooks/:id/snapshots endpoints"
```

---

## Task 11: WebSocket `/api/v1/ws/:workbookId` — connect + welcome only

**Files:**
- Create: `packages/server/src/ws/welcome.ts`
- Create: `packages/server/src/server.ts`
- Create: `packages/server/test/integration/ws-welcome.int.test.ts`
- Modify: `packages/server/src/index.ts`

> Single-user Sprint 1 — the WS just authenticates, reads the latest snapshot, sends one `welcome` frame, then idles. Collab arrives in Sprint 3.

- [ ] **Step 11.1: Failing integration test**

Create `packages/server/test/integration/ws-welcome.int.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { db, dbUrl } from './_setup'
import { tenants, workbooks } from '../../src/db/schema'
import { createServer } from '../../src/server'
import type { IdentityAdapter, PermissionAdapter } from '../../src/adapters/identity'
import { NoopEventAdapter } from '../../src/adapters/identity'

describe('WS welcome', () => {
  it('sends a welcome frame after connecting with a valid token', async () => {
    const [tenant] = await db.insert(tenants).values({ name: 'ws-t' }).returning()
    const [wb] = await db
      .insert(workbooks)
      .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WS' })
      .returning()
    const identity: IdentityAdapter = {
      resolveFromToken: async (t) => {
        if (t !== 'ok') throw new Error('bad')
        return { tenantId: tenant.id, userId: 'u1' }
      },
    }
    const permission: PermissionAdapter = {
      getCapabilities: async () => ({ canView: true, canEdit: false, canShare: false, canDelete: false }),
      getMaskRules: async () => [],
    }
    const memBlobs = new Map<string, Uint8Array>()
    const storage = {
      put: async (k: string, b: Uint8Array) => { memBlobs.set(k, b) },
      get: async (k: string) => memBlobs.get(k) ?? new Uint8Array(),
      delete: async (k: string) => { memBlobs.delete(k) },
    }
    const handle = await createServer({
      databaseUrl: dbUrl,
      identity,
      permission,
      storage,
      event: new NoopEventAdapter(),
    }).listen({ port: 0 })

    const ws = new WebSocket(`ws://127.0.0.1:${handle.port}/api/v1/ws/${wb.id}?token=ok`)
    const frame: { type: string; snapshot: unknown } = await new Promise((resolve, reject) => {
      ws.once('message', (data) => resolve(JSON.parse(data.toString())))
      ws.once('error', reject)
    })
    expect(frame.type).toBe('welcome')
    ws.close()
    await handle.close()
  })
})
```

Run: expect FAIL.

- [ ] **Step 11.2: WS welcome handler**

Create `packages/server/src/ws/welcome.ts`:

```ts
import type { WSContext } from '@hono/node-ws'
import type { AppDeps } from '../http/app'
import { createSnapshotService } from '../services/snapshot-service'
import { createWorkbookService } from '../services/workbook-service'

export async function sendWelcome(
  ws: WSContext,
  deps: AppDeps,
  ctx: { tenantId: string; userId: string; workbookId: string }
) {
  const wb = await createWorkbookService(deps.db).get({ tenantId: ctx.tenantId, id: ctx.workbookId })
  if (!wb) {
    ws.send(JSON.stringify({ type: 'error', code: 'not_found' }))
    ws.close()
    return
  }
  const snap = await createSnapshotService(deps.db, deps.storage).getLatest(wb.id)
  const snapshotJson = snap ? new TextDecoder().decode(await deps.storage.get(snap.storageKey)) : null
  ws.send(
    JSON.stringify({
      type: 'welcome',
      workbookId: wb.id,
      seqNum: 0,
      snapshot: snapshotJson ? JSON.parse(snapshotJson) : null,
      presence: [],
      locks: [],
    })
  )
}
```

- [ ] **Step 11.3: `createServer` factory**

Create `packages/server/src/server.ts`:

```ts
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp, type AppDeps } from './http/app'
import { createDb } from './db/client'
import type { IdentityAdapter, PermissionAdapter, EventAdapter } from './adapters/identity'
import type { StorageAdapter } from './adapters/storage'
import { sendWelcome } from './ws/welcome'

export interface CreateServerOpts {
  databaseUrl: string
  identity: IdentityAdapter
  permission: PermissionAdapter
  storage: StorageAdapter
  event: EventAdapter
}

export function createServer(opts: CreateServerOpts) {
  const db = createDb(opts.databaseUrl)
  const deps: AppDeps = {
    db,
    identity: opts.identity,
    permission: opts.permission,
    storage: opts.storage,
    event: opts.event,
  }
  const app = buildApp(deps)
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

  app.get(
    '/api/v1/ws/:workbookId',
    upgradeWebSocket(async (c) => {
      const token = c.req.query('token')
      const workbookId = c.req.param('workbookId')
      let identity: Awaited<ReturnType<IdentityAdapter['resolveFromToken']>> | null = null
      try {
        if (!token) throw new Error('missing token')
        identity = await opts.identity.resolveFromToken(token)
      } catch {
        return {
          onOpen(_e, ws) {
            ws.send(JSON.stringify({ type: 'error', code: 'unauthorized' }))
            ws.close()
          },
        }
      }
      const id = identity
      return {
        async onOpen(_e, ws) {
          const cap = await opts.permission.getCapabilities(id!, {
            type: 'workbook',
            id: workbookId,
            tenantId: id!.tenantId,
          })
          if (!cap.canView) {
            ws.send(JSON.stringify({ type: 'error', code: 'forbidden' }))
            ws.close()
            return
          }
          await sendWelcome(ws, deps, { tenantId: id!.tenantId, userId: id!.userId, workbookId })
        },
      }
    })
  )

  return {
    listen({ port }: { port: number }) {
      return new Promise<{ port: number; close(): Promise<void> }>((resolve) => {
        const server = serve({ fetch: app.fetch, port }, (info) => {
          injectWebSocket(server)
          resolve({
            port: info.port,
            close: () => new Promise((r) => server.close(() => r())),
          })
        })
      })
    },
  }
}
```

- [ ] **Step 11.4: Re-export from index**

Edit `packages/server/src/index.ts` — append:

```ts
export { createServer, type CreateServerOpts } from './server'
export { buildApp, type AppDeps } from './http/app'
```

- [ ] **Step 11.5: Run — expect pass**

```bash
pnpm --filter @ensemble/server test test/integration/ws-welcome.int.test.ts
```

Expected: 1/1 PASS.

- [ ] **Step 11.6: Commit**

```bash
git add packages/server
git commit -m "feat(server): WS /api/v1/ws/:workbookId welcome handshake"
```

> **🟢 Milestone 3 checkpoint** — run `pnpm --filter @ensemble/server test --coverage`. **Verify coverage ≥ 90% lines on `src/`.** If short, the gap is almost certainly error branches in `routes/*.ts` and `auth.ts` — add tests for: missing Authorization header, identity throwing, missing workbook on snapshot POST, empty body 400.

---

# Milestone 4 — Storage + Webhook adapters

## Task 12: `@ensemble/storage-fs`

**Files:**
- Create: `packages/storage-fs/package.json`
- Create: `packages/storage-fs/tsconfig.json`
- Create: `packages/storage-fs/src/index.ts`
- Create: `packages/storage-fs/test/storage-fs.test.ts`

- [ ] **Step 12.1: Package + tsconfig**

Create `packages/storage-fs/package.json`:

```json
{
  "name": "@ensemble/storage-fs",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": { "@ensemble/server": "workspace:*" },
  "devDependencies": {
    "@ensemble/server": "workspace:*",
    "@types/node": "20.16.10"
  }
}
```

Create `packages/storage-fs/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src"]
}
```

- [ ] **Step 12.2: Failing test**

Create `packages/storage-fs/test/storage-fs.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FsStorage } from '../src/index'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ensemble-fs-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('FsStorage', () => {
  it('put then get returns the same bytes', async () => {
    const s = new FsStorage({ root: dir })
    const b = new TextEncoder().encode('hi')
    await s.put('a/b.json', b)
    const back = await s.get('a/b.json')
    expect(new TextDecoder().decode(back)).toBe('hi')
  })
  it('delete makes get reject', async () => {
    const s = new FsStorage({ root: dir })
    await s.put('x', new Uint8Array([1, 2, 3]))
    await s.delete('x')
    await expect(s.get('x')).rejects.toThrow()
  })
  it('rejects path escapes', async () => {
    const s = new FsStorage({ root: dir })
    await expect(s.put('../escape', new Uint8Array([1]))).rejects.toThrow(/path/i)
  })
})
```

Run: expect FAIL.

- [ ] **Step 12.3: Implement**

Create `packages/storage-fs/src/index.ts`:

```ts
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path'
import type { StorageAdapter } from '@ensemble/server'

export interface FsStorageOpts { root: string }

export class FsStorage implements StorageAdapter {
  private readonly root: string
  constructor(opts: FsStorageOpts) {
    this.root = resolve(opts.root)
  }
  private safe(key: string): string {
    if (isAbsolute(key)) throw new Error('storage path must be relative')
    const full = resolve(this.root, normalize(key))
    if (!(full === this.root || full.startsWith(this.root + sep))) {
      throw new Error('storage path escapes root')
    }
    return full
  }
  async put(key: string, body: Uint8Array): Promise<void> {
    const full = this.safe(key)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, body)
  }
  async get(key: string): Promise<Uint8Array> {
    const buf = await readFile(this.safe(key))
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  async delete(key: string): Promise<void> {
    await rm(this.safe(key), { force: true })
  }
}
```

- [ ] **Step 12.4: Build server first (peer dep) then test**

```bash
pnpm --filter @ensemble/server build
pnpm install
pnpm --filter @ensemble/storage-fs test
```

Expected: 3/3 PASS.

- [ ] **Step 12.5: Commit**

```bash
git add packages/storage-fs pnpm-lock.yaml
git commit -m "feat(storage-fs): local filesystem StorageAdapter"
```

---

## Task 13: `@ensemble/storage-s3`

**Files:**
- Create: `packages/storage-s3/package.json`
- Create: `packages/storage-s3/tsconfig.json`
- Create: `packages/storage-s3/src/index.ts`
- Create: `packages/storage-s3/test/storage-s3.test.ts`

> Uses LocalStack via Testcontainers so CI doesn't need real S3.

- [ ] **Step 13.1: Package + deps**

Create `packages/storage-s3/package.json`:

```json
{
  "name": "@ensemble/storage-s3",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": { "@ensemble/server": "workspace:*" },
  "dependencies": {
    "@aws-sdk/client-s3": "3.668.0",
    "@aws-sdk/s3-request-presigner": "3.668.0"
  },
  "devDependencies": {
    "@ensemble/server": "workspace:*",
    "@types/node": "20.16.10",
    "testcontainers": "10.13.2"
  }
}
```

Create `packages/storage-s3/tsconfig.json` (same shape as storage-fs).

- [ ] **Step 13.2: Failing test (LocalStack-backed)**

Create `packages/storage-s3/test/storage-s3.test.ts`:

```ts
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GenericContainer, type StartedTestContainer } from 'testcontainers'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3Storage } from '../src/index'

let container: StartedTestContainer
let endpoint: string

beforeAll(async () => {
  container = await new GenericContainer('localstack/localstack:3')
    .withExposedPorts(4566)
    .withEnvironment({ SERVICES: 's3' })
    .start()
  endpoint = `http://${container.getHost()}:${container.getMappedPort(4566)}`
  const raw = new S3Client({
    endpoint,
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    forcePathStyle: true,
  })
  await raw.send(new CreateBucketCommand({ Bucket: 'ensemble-test' }))
}, 90_000)

afterAll(async () => { await container?.stop() }, 30_000)

describe('S3Storage', () => {
  it('put then get round-trips', async () => {
    const s = new S3Storage({
      bucket: 'ensemble-test',
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    })
    const body = new TextEncoder().encode('hello s3')
    await s.put('a/b.json', body, { contentType: 'application/json' })
    const back = await s.get('a/b.json')
    expect(new TextDecoder().decode(back)).toBe('hello s3')
  })
})
```

Run: expect FAIL.

- [ ] **Step 13.3: Implement**

Create `packages/storage-s3/src/index.ts`:

```ts
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client, type S3ClientConfig } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageAdapter } from '@ensemble/server'

export interface S3StorageOpts extends S3ClientConfig {
  bucket: string
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client
  private readonly bucket: string
  constructor(opts: S3StorageOpts) {
    const { bucket, ...rest } = opts
    this.bucket = bucket
    this.client = new S3Client(rest)
  }
  async put(key: string, body: Uint8Array, opts?: { contentType?: string }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: opts?.contentType,
      })
    )
  }
  async get(key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }))
    return res.Body!.transformToByteArray()
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
  async signedGetUrl(key: string, ttlSec = 600, filename?: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: filename ? `attachment; filename="${filename}"` : undefined,
    })
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSec })
  }
  async signedPutUrl(key: string, ttlSec = 600): Promise<string> {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: ttlSec })
  }
}
```

- [ ] **Step 13.4: Run — expect pass**

```bash
pnpm install
pnpm --filter @ensemble/storage-s3 test
```

Expected: 1/1 PASS (slow — ~30s for LocalStack pull on first run).

- [ ] **Step 13.5: Commit**

```bash
git add packages/storage-s3 pnpm-lock.yaml
git commit -m "feat(storage-s3): S3/R2/MinIO StorageAdapter via aws-sdk v3"
```

---

## Task 14: `@ensemble/webhook` — generic HTTP adapter wrapper

**Files:**
- Create: `packages/webhook/package.json`
- Create: `packages/webhook/tsconfig.json`
- Create: `packages/webhook/src/index.ts`
- Create: `packages/webhook/test/webhook.test.ts`

> Routes Identity/Permission/Event calls to an arbitrary HTTP endpoint signed with HMAC-SHA256. This is the "any language host" escape hatch.

- [ ] **Step 14.1: Package manifest**

Create `packages/webhook/package.json`:

```json
{
  "name": "@ensemble/webhook",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": { "@ensemble/server": "workspace:*" },
  "devDependencies": {
    "@ensemble/server": "workspace:*",
    "@types/node": "20.16.10"
  }
}
```

Create `packages/webhook/tsconfig.json` (same shape as storage-fs).

- [ ] **Step 14.2: Failing test**

Create `packages/webhook/test/webhook.test.ts`:

```ts
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  WebhookIdentityAdapter,
  WebhookPermissionAdapter,
  WebhookEventAdapter,
} from '../src/index'

let url: string
let close: () => Promise<void>
const requests: { path: string; body: unknown; signature: string | null }[] = []

beforeAll(async () => {
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    requests.push({
      path: req.url ?? '',
      body: raw ? JSON.parse(raw) : null,
      signature: (req.headers['x-ensemble-signature'] as string) ?? null,
    })
    if (req.url === '/identity') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ tenantId: 't1', userId: 'u1' })); return
    }
    if (req.url === '/permission') {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ canView: true, canEdit: false, canShare: false, canDelete: false })); return
    }
    if (req.url === '/event') { res.statusCode = 204; res.end(); return }
    res.statusCode = 404; res.end()
  })
  await new Promise<void>((r) => server.listen(0, r))
  const addr = server.address()
  if (!addr || typeof addr === 'string') throw new Error('no addr')
  url = `http://127.0.0.1:${addr.port}`
  close = () => new Promise((r) => server.close(() => r()))
})
afterAll(() => close())

describe('Webhook adapters', () => {
  it('Identity sends signed POST to /identity with the token', async () => {
    const a = new WebhookIdentityAdapter({ url: url + '/identity', secret: 's' })
    const ctx = await a.resolveFromToken('jwt-here')
    expect(ctx).toEqual({ tenantId: 't1', userId: 'u1' })
    const r = requests.find((x) => x.path === '/identity')!
    expect(r.body).toEqual({ token: 'jwt-here' })
    expect(r.signature).toMatch(/^sha256=[0-9a-f]{64}$/)
  })

  it('Permission sends getCapabilities request', async () => {
    const a = new WebhookPermissionAdapter({ url: url + '/permission', secret: 's' })
    const cap = await a.getCapabilities({ tenantId: 't', userId: 'u' }, { type: 'workbook', id: 'w', tenantId: 't' })
    expect(cap.canView).toBe(true)
  })

  it('Event swallows host errors (fire-and-forget)', async () => {
    const a = new WebhookEventAdapter({ url: url + '/missing', secret: 's' })
    await expect(
      a.publish({ type: 'workbook.opened', workbookId: 'w', userId: 'u', at: new Date().toISOString() })
    ).resolves.toBeUndefined()
  })
})
```

Run: expect FAIL.

- [ ] **Step 14.3: Implement**

Create `packages/webhook/src/index.ts`:

```ts
import { createHmac } from 'node:crypto'
import type {
  IdentityAdapter,
  PermissionAdapter,
  EventAdapter,
  IdentityContext,
  ResourceRef,
  Capability,
  MaskRule,
  EnsembleEvent,
} from '@ensemble/server'

export interface WebhookOpts {
  url: string
  secret: string
  timeoutMs?: number
}

function sign(secret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

async function post<T>(opts: WebhookOpts, payload: unknown, expect2xx: boolean): Promise<T | null> {
  const body = JSON.stringify(payload)
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 5000)
  try {
    const res = await fetch(opts.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-ensemble-signature': sign(opts.secret, body),
      },
      body,
      signal: controller.signal,
    })
    if (!res.ok) {
      if (expect2xx) throw new Error(`webhook ${opts.url} returned ${res.status}`)
      return null
    }
    if (res.status === 204) return null
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

export class WebhookIdentityAdapter implements IdentityAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async resolveFromToken(token: string): Promise<IdentityContext> {
    const r = await post<IdentityContext>(this.opts, { token }, true)
    if (!r) throw new Error('identity webhook returned no body')
    return r
  }
}

export class WebhookPermissionAdapter implements PermissionAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async getCapabilities(identity: IdentityContext, resource: ResourceRef): Promise<Capability> {
    const r = await post<Capability>(this.opts, { op: 'capabilities', identity, resource }, true)
    if (!r) throw new Error('permission webhook returned no body')
    return r
  }
  async getMaskRules(identity: IdentityContext, workbook: ResourceRef): Promise<MaskRule[]> {
    const r = await post<MaskRule[]>(this.opts, { op: 'mask_rules', identity, resource: workbook }, true)
    return r ?? []
  }
}

export class WebhookEventAdapter implements EventAdapter {
  constructor(private readonly opts: WebhookOpts) {}
  async publish(event: EnsembleEvent): Promise<void> {
    try {
      await post(this.opts, event, false)
    } catch {
      /* fire-and-forget */
    }
  }
}
```

- [ ] **Step 14.4: Run — expect pass**

```bash
pnpm --filter @ensemble/server build
pnpm install
pnpm --filter @ensemble/webhook test
```

Expected: 3/3 PASS.

- [ ] **Step 14.5: Commit**

```bash
git add packages/webhook pnpm-lock.yaml
git commit -m "feat(webhook): signed-HTTP Identity/Permission/Event adapters"
```

---

## Task 15: FsStorage end-to-end sanity check inside server tests

**Files:**
- Modify: `packages/server/package.json` (add `@ensemble/storage-fs` as devDependency)
- Modify: `packages/server/test/integration/snapshots.int.test.ts`

- [ ] **Step 15.1: Add devDependency**

Edit `packages/server/package.json` — add to `devDependencies`:

```json
"@ensemble/storage-fs": "workspace:*"
```

Run `pnpm install`.

- [ ] **Step 15.2: Add an FsStorage round-trip test**

Append to `packages/server/test/integration/snapshots.int.test.ts`:

```ts
import { FsStorage } from '@ensemble/storage-fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

it('snapshot round-trips through FsStorage', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'snap-fs-'))
  const storage = new FsStorage({ root: dir })
  const [tenant] = await db.insert(tenants).values({ name: 'snap-fs-t' }).returning()
  const [wb] = await db
    .insert(workbooks)
    .values({ tenantId: tenant.id, ownerId: 'u1', name: 'WB' })
    .returning()
  const identity: IdentityAdapter = {
    resolveFromToken: async () => ({ tenantId: tenant.id, userId: 'u1' }),
  }
  const permission: PermissionAdapter = {
    getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
    getMaskRules: async () => [],
  }
  const app = buildApp({ db, identity, permission, storage, event: new NoopEventAdapter() })
  const payload = new TextEncoder().encode('{"fs":"ok"}')
  const post = await app.request(`/api/v1/workbooks/${wb.id}/snapshots`, {
    method: 'POST',
    headers: { Authorization: 'Bearer x', 'content-type': 'application/json' },
    body: payload,
  })
  expect(post.status).toBe(201)
  const get = await app.request(`/api/v1/workbooks/${wb.id}/snapshot`, {
    headers: { Authorization: 'Bearer x' },
  })
  expect(get.status).toBe(200)
  const body = new Uint8Array(await get.arrayBuffer())
  expect(new TextDecoder().decode(body)).toBe('{"fs":"ok"}')
})
```

- [ ] **Step 15.3: Run — expect pass**

```bash
pnpm --filter @ensemble/server test test/integration/snapshots.int.test.ts
```

Expected: 2/2 PASS (original + FsStorage round-trip).

- [ ] **Step 15.4: Commit**

```bash
git add packages/server pnpm-lock.yaml
git commit -m "test(server): FsStorage round-trip integration check"
```

> **🟢 Milestone 4 checkpoint** — `pnpm -r test --coverage` should be all-green. Adapters now satisfy the storage path used by the demo.

---

# Milestone 5 — `@ensemble/core` (frontend SDK)

## Task 16: Core package skeleton + REST `ApiClient`

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/api-client.ts`
- Create: `packages/core/test/api-client.test.ts`

- [ ] **Step 16.1: Package manifest**

Create `packages/core/package.json`:

```json
{
  "name": "@ensemble/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@univerjs/core": "0.5.0",
    "@univerjs/design": "0.5.0",
    "@univerjs/docs": "0.5.0",
    "@univerjs/docs-ui": "0.5.0",
    "@univerjs/engine-formula": "0.5.0",
    "@univerjs/engine-render": "0.5.0",
    "@univerjs/sheets": "0.5.0",
    "@univerjs/sheets-formula": "0.5.0",
    "@univerjs/sheets-ui": "0.5.0",
    "@univerjs/ui": "0.5.0",
    "xlsx": "0.20.3"
  },
  "devDependencies": {
    "jsdom": "25.0.1"
  }
}
```

> Univer versions may need updating to whatever is `latest` when execution begins. The plan's API surface only depends on `Univer`, `IWorkbookData`, `UniverInstanceType` and plugin registration which has been stable across recent versions.

- [ ] **Step 16.2: TS + vitest config**

Create `packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "types": ["node"] },
  "include": ["src"]
}
```

Create `packages/core/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      thresholds: { lines: 90, statements: 90, functions: 85, branches: 80 },
    },
  },
})
```

- [ ] **Step 16.3: Shared types**

Create `packages/core/src/types.ts`:

```ts
export interface Workbook {
  id: string
  tenantId: string
  folderId: string | null
  name: string
  ownerId: string
  currentSnapshotId: string | null
  createdAt: string
  updatedAt: string
}

export interface Snapshot {
  id: string
  workbookId: string
  storageKey: string
  sizeBytes: number
  createdBy: string
  createdAt: string
  reason: 'auto' | 'manual' | 'named'
  name: string | null
}

export interface UniverSheet {
  id: string
  name: string
  cellData: Record<string, Record<string, { v?: unknown; m?: string }>>
}

export interface UniverWorkbookData {
  id: string
  sheetOrder: string[]
  sheets: Record<string, UniverSheet>
}
```

- [ ] **Step 16.4: Failing test for ApiClient**

Create `packages/core/test/api-client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { ApiClient } from '../src/api-client'

function makeFetch(handler: (req: { url: string; init: RequestInit }) => Response) {
  return vi.fn(async (url: string, init?: RequestInit) =>
    handler({ url, init: init ?? {} })
  )
}

describe('ApiClient', () => {
  it('attaches Authorization header from token provider', async () => {
    const fetch = makeFetch(({ init }) => {
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok')
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 'tok', fetch })
    const r = await api.listWorkbooks()
    expect(r.items).toEqual([])
  })

  it('throws on non-2xx with parsed message', async () => {
    const fetch = makeFetch(() =>
      new Response(JSON.stringify({ error: 'nope' }), { status: 403 })
    )
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    await expect(api.listWorkbooks()).rejects.toThrow(/nope/)
  })

  it('uploads snapshot bytes as raw body', async () => {
    const fetch = makeFetch(({ init }) => {
      expect(init.method).toBe('POST')
      expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
      return new Response(JSON.stringify({ id: 'snap1' }), { status: 201 })
    })
    const api = new ApiClient({ baseUrl: 'https://x', token: async () => 't', fetch })
    const snap = await api.uploadSnapshot('wb1', new Uint8Array([1, 2, 3]))
    expect(snap.id).toBe('snap1')
  })
})
```

Run: expect FAIL.

- [ ] **Step 16.5: Implement**

Create `packages/core/src/api-client.ts`:

```ts
import type { Snapshot, Workbook } from './types'

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
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    const res = await this.fetchImpl(this.baseUrl + path, { ...init, headers })
    if (!res.ok) {
      const text = await res.text()
      let msg = text
      try { msg = (JSON.parse(text) as { error?: string }).error ?? text } catch { /* keep text */ }
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
  async getLatestSnapshot(id: string): Promise<unknown | null> {
    const res = await this.req(`/api/v1/workbooks/${id}/snapshot`)
    if (res.status === 204) return null
    return res.json()
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
}
```

- [ ] **Step 16.6: Index export**

Create `packages/core/src/index.ts`:

```ts
export { ApiClient, type ApiClientOpts } from './api-client'
export * from './types'
```

- [ ] **Step 16.7: Run — expect pass**

```bash
pnpm install
pnpm --filter @ensemble/core test
```

Expected: 3/3 PASS.

- [ ] **Step 16.8: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): ApiClient for workbook + snapshot REST"
```

---

## Task 17: SheetJS ↔ Univer JSON converter

**Files:**
- Create: `packages/core/src/xlsx-converter.ts`
- Modify: `packages/core/src/index.ts` (export)
- Create: `packages/core/test/xlsx-converter.test.ts`

- [ ] **Step 17.1: Failing test (round-trip a small workbook)**

Create `packages/core/test/xlsx-converter.test.ts`:

```ts
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { univerJsonToXlsx, xlsxToUniverJson } from '../src/xlsx-converter'

function makeXlsx(): Uint8Array {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Score'],
    ['Alice', 90],
    ['Bob', 85.5],
  ])
  XLSX.utils.book_append_sheet(wb, ws, 'Grades')
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}

describe('xlsx-converter', () => {
  it('xlsx → Univer JSON keeps sheet name and cell values', () => {
    const ujson = xlsxToUniverJson(makeXlsx())
    expect(ujson.sheetOrder.length).toBe(1)
    const firstSheetId = ujson.sheetOrder[0]
    const sheet = ujson.sheets[firstSheetId]
    expect(sheet.name).toBe('Grades')
    expect(sheet.cellData['0']['0'].v).toBe('Name')
    expect(sheet.cellData['1']['1'].v).toBe(90)
    expect(sheet.cellData['2']['1'].v).toBe(85.5)
  })

  it('Univer JSON → xlsx round-trips back to the same cell values', () => {
    const ujson = xlsxToUniverJson(makeXlsx())
    const bytes = univerJsonToXlsx(ujson)
    const wb = XLSX.read(bytes, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    expect(XLSX.utils.sheet_to_json(ws, { header: 1 })).toEqual([
      ['Name', 'Score'],
      ['Alice', 90],
      ['Bob', 85.5],
    ])
  })
})
```

Run: expect FAIL.

- [ ] **Step 17.2: Implement converter**

Create `packages/core/src/xlsx-converter.ts`:

```ts
import * as XLSX from 'xlsx'
import type { UniverSheet, UniverWorkbookData } from './types'

function sheetIdFromName(name: string, idx: number): string {
  return `sheet-${idx}-${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

export function xlsxToUniverJson(bytes: Uint8Array): UniverWorkbookData {
  const wb = XLSX.read(bytes, { type: 'array' })
  const sheetOrder: string[] = []
  const sheets: Record<string, UniverSheet> = {}
  wb.SheetNames.forEach((name, idx) => {
    const ws = wb.Sheets[name]
    const id = sheetIdFromName(name, idx)
    sheetOrder.push(id)
    const cellData: UniverSheet['cellData'] = {}
    const range = ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
    if (range) {
      for (let r = range.s.r; r <= range.e.r; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
          const ref = XLSX.utils.encode_cell({ r, c })
          const cell = ws[ref]
          if (!cell || cell.v === undefined) continue
          const row = (cellData[r.toString()] ??= {})
          row[c.toString()] = { v: cell.v, ...(cell.w ? { m: cell.w } : {}) }
        }
      }
    }
    sheets[id] = { id, name, cellData }
  })
  return { id: 'wb-' + crypto.randomUUID(), sheetOrder, sheets }
}

export function univerJsonToXlsx(data: UniverWorkbookData): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const sheetId of data.sheetOrder) {
    const sheet = data.sheets[sheetId]
    const aoa: unknown[][] = []
    for (const rStr of Object.keys(sheet.cellData)) {
      const r = Number(rStr)
      const row = sheet.cellData[rStr]
      aoa[r] ??= []
      for (const cStr of Object.keys(row)) {
        const c = Number(cStr)
        aoa[r][c] = row[cStr].v
      }
    }
    for (let r = 0; r < aoa.length; r++) aoa[r] ??= []
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(wb, ws, sheet.name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
```

- [ ] **Step 17.3: Export from index**

Edit `packages/core/src/index.ts` — add:

```ts
export { xlsxToUniverJson, univerJsonToXlsx } from './xlsx-converter'
```

- [ ] **Step 17.4: Run — expect pass**

```bash
pnpm --filter @ensemble/core test
```

Expected: 5/5 PASS (3 ApiClient + 2 converter).

- [ ] **Step 17.5: Commit**

```bash
git add packages/core
git commit -m "feat(core): SheetJS ↔ Univer JSON converter"
```

---

## Task 18: Univer wrapper

**Files:**
- Create: `packages/core/src/univer-wrapper.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/univer-wrapper.test.ts`

> The wrapper exposes `createEditor({ container }) → { load(data), getData(), destroy() }`. We test the **shape** (factory returns the right surface). Full visual rendering is exercised by Playwright in Task 23.

- [ ] **Step 18.1: Failing test**

Create `packages/core/test/univer-wrapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createEditor } from '../src/univer-wrapper'

describe('createEditor', () => {
  it('returns load / getData / destroy', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const ed = createEditor({ container })
    expect(typeof ed.load).toBe('function')
    expect(typeof ed.getData).toBe('function')
    expect(typeof ed.destroy).toBe('function')
    ed.destroy()
  })
})
```

Run: expect FAIL.

- [ ] **Step 18.2: Implement wrapper**

Create `packages/core/src/univer-wrapper.ts`:

```ts
import { LocaleType, Univer, UniverInstanceType, type IWorkbookData } from '@univerjs/core'
import { defaultTheme } from '@univerjs/design'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'
import type { UniverWorkbookData } from './types'

export interface EditorOpts {
  container: HTMLElement
  locale?: LocaleType
}

export interface Editor {
  load(data: UniverWorkbookData): void
  getData(): UniverWorkbookData
  destroy(): void
}

function toUniverWorkbook(data: UniverWorkbookData): IWorkbookData {
  const sheets: IWorkbookData['sheets'] = {}
  for (const id of data.sheetOrder) {
    const s = data.sheets[id]
    sheets[id] = { id, name: s.name, cellData: s.cellData as never }
  }
  return { id: data.id, sheetOrder: data.sheetOrder, sheets }
}

function fromUniverWorkbook(snapshot: IWorkbookData): UniverWorkbookData {
  const sheets: UniverWorkbookData['sheets'] = {}
  for (const id of snapshot.sheetOrder) {
    const s = snapshot.sheets[id]
    sheets[id] = { id, name: s.name ?? id, cellData: (s.cellData as never) ?? {} }
  }
  return { id: snapshot.id, sheetOrder: snapshot.sheetOrder, sheets }
}

export function createEditor(opts: EditorOpts): Editor {
  let univer: Univer | null = new Univer({
    theme: defaultTheme,
    locale: opts.locale ?? LocaleType.EN_US,
  })
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverFormulaEnginePlugin)
  univer.registerPlugin(UniverUIPlugin, { container: opts.container })
  univer.registerPlugin(UniverSheetsPlugin)
  univer.registerPlugin(UniverSheetsUIPlugin)
  univer.registerPlugin(UniverSheetsFormulaPlugin)

  let currentId: string | null = null

  return {
    load(data) {
      if (!univer) throw new Error('editor destroyed')
      currentId = data.id
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, toUniverWorkbook(data))
    },
    getData() {
      if (!univer || !currentId) throw new Error('no workbook loaded')
      const snap = univer.getSnapshot(currentId) as IWorkbookData
      return fromUniverWorkbook(snap)
    },
    destroy() {
      univer?.dispose()
      univer = null
    },
  }
}
```

> ⚠️ If the Univer version pinned in `package.json` doesn't expose `getSnapshot` on the `Univer` class, look it up on `IUniverInstanceService` retrieved via `univer.__getInjector().get(IUniverInstanceService)` — see Univer docs at execution time. The test in Step 18.1 will surface that mismatch as a `getData is not a function` type error.

- [ ] **Step 18.3: Export**

Edit `packages/core/src/index.ts` — add:

```ts
export { createEditor, type Editor, type EditorOpts } from './univer-wrapper'
```

- [ ] **Step 18.4: Run — expect pass**

```bash
pnpm --filter @ensemble/core test
```

Expected: PASS for the shape test. (Full `load`/`getData` is exercised by the demo's Playwright test in Task 23.)

- [ ] **Step 18.5: Commit**

```bash
git add packages/core
git commit -m "feat(core): Univer wrapper with createEditor()"
```

---

## Task 19: WS client (welcome-only flow)

**Files:**
- Create: `packages/core/src/ws-client.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/ws-client.test.ts`

- [ ] **Step 19.1: Failing test (uses a stub WebSocket)**

Create `packages/core/test/ws-client.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { WsClient } from '../src/ws-client'

function stubSocketFactory() {
  const sockets: StubSocket[] = []
  class StubSocket {
    public sent: string[] = []
    public listeners = new Map<string, ((ev: { data: string }) => void)[]>()
    constructor(public readonly url: string) {
      sockets.push(this)
    }
    addEventListener(t: string, cb: (ev: { data: string }) => void) {
      this.listeners.set(t, [...(this.listeners.get(t) ?? []), cb])
    }
    send(d: string) { this.sent.push(d) }
    close() { this.listeners.get('close')?.forEach((cb) => cb({ data: '' })) }
    fire(t: string, data: string) { this.listeners.get(t)?.forEach((cb) => cb({ data })) }
  }
  return { sockets, Ctor: StubSocket }
}

describe('WsClient', () => {
  it('resolves welcome promise when server sends welcome frame', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({
      url: 'ws://x',
      workbookId: 'w1',
      token: () => 't',
      WebSocketImpl: Ctor as never,
    })
    const p = client.connect()
    expect(sockets[0].url).toContain('ws://x/api/v1/ws/w1?token=t')
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'welcome', workbookId: 'w1', seqNum: 0, snapshot: null }))
    const w = await p
    expect(w.workbookId).toBe('w1')
    expect(w.seqNum).toBe(0)
    expect(w.snapshot).toBeNull()
  })

  it('rejects when server sends error frame', async () => {
    const { sockets, Ctor } = stubSocketFactory()
    const client = new WsClient({ url: 'ws://x', workbookId: 'w', token: () => 't', WebSocketImpl: Ctor as never })
    const p = client.connect()
    sockets[0].fire('open', '')
    sockets[0].fire('message', JSON.stringify({ type: 'error', code: 'unauthorized' }))
    await expect(p).rejects.toThrow(/unauthorized/)
  })
})
```

Run: expect FAIL.

- [ ] **Step 19.2: Implement**

Create `packages/core/src/ws-client.ts`:

```ts
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
  constructor(opts: WsClientOpts) { this.opts = opts }

  async connect(): Promise<WelcomeFrame> {
    const token = await this.opts.token()
    const url = `${this.opts.url.replace(/\/$/, '')}/api/v1/ws/${this.opts.workbookId}?token=${encodeURIComponent(token)}`
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
```

- [ ] **Step 19.3: Export**

Edit `packages/core/src/index.ts`:

```ts
export { WsClient, type WelcomeFrame } from './ws-client'
```

- [ ] **Step 19.4: Run — expect pass**

```bash
pnpm --filter @ensemble/core test
```

Expected: all core tests PASS.

- [ ] **Step 19.5: Commit**

```bash
git add packages/core
git commit -m "feat(core): WsClient connect + welcome handler"
```

---

## Task 20: `mountWorkbookEditor` — top-level core helper

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/mount.ts`
- Create: `packages/core/test/mount.test.ts`

> Single entry point used by both `@ensemble/react` and `@ensemble/vue`. The framework wrappers shouldn't know REST/WS/Univer details — only how to call `mountWorkbookEditor({ container, ... })`.

- [ ] **Step 20.1: Failing test**

Create `packages/core/test/mount.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { mountWorkbookEditor } from '../src/mount'

describe('mountWorkbookEditor', () => {
  it('fetches snapshot, loads editor, returns save() handle', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const loaded: unknown[] = []
    const fakeEditor = {
      load: (d: unknown) => loaded.push(d),
      getData: () => ({ id: 'w', sheetOrder: ['s'], sheets: { s: { id: 's', name: 'S', cellData: {} } } }),
      destroy: vi.fn(),
    }
    const handle = await mountWorkbookEditor({
      container,
      workbookId: 'w',
      apiBaseUrl: 'https://api',
      wsBaseUrl: 'wss://api',
      token: async () => 't',
      fetch: vi.fn(async (url: string) => {
        if (url.endsWith('/snapshot'))
          return new Response(JSON.stringify({ id: 'w', sheetOrder: [], sheets: {} }), { status: 200 })
        return new Response('', { status: 200 })
      }) as never,
      _editorFactory: () => fakeEditor as never,
      _wsConnect: async () => ({ type: 'welcome', workbookId: 'w', seqNum: 0, snapshot: null }),
    })
    expect(loaded.length).toBe(1)
    expect(typeof handle.save).toBe('function')
    expect(typeof handle.destroy).toBe('function')
  })
})
```

Run: expect FAIL.

- [ ] **Step 20.2: Implement**

Create `packages/core/src/mount.ts`:

```ts
import { ApiClient } from './api-client'
import { createEditor, type Editor } from './univer-wrapper'
import { WsClient, type WelcomeFrame } from './ws-client'
import { univerJsonToXlsx, xlsxToUniverJson } from './xlsx-converter'
import type { UniverWorkbookData } from './types'

export interface MountOpts {
  container: HTMLElement
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  fetch?: typeof fetch
  /** @internal — for tests */
  _editorFactory?: (container: HTMLElement) => Editor
  /** @internal — for tests */
  _wsConnect?: () => Promise<WelcomeFrame>
}

export interface MountHandle {
  save(): Promise<{ id: string }>
  exportXlsx(): Uint8Array
  destroy(): void
}

export async function mountWorkbookEditor(opts: MountOpts): Promise<MountHandle> {
  const api = new ApiClient({ baseUrl: opts.apiBaseUrl, token: opts.token, fetch: opts.fetch })
  const editor = (opts._editorFactory ?? ((c) => createEditor({ container: c })))(opts.container)
  const ws = new WsClient({ url: opts.wsBaseUrl, workbookId: opts.workbookId, token: opts.token })

  if (opts._wsConnect) await opts._wsConnect()
  else await ws.connect()

  const snapshot = (await api.getLatestSnapshot(opts.workbookId)) as UniverWorkbookData | null
  const data: UniverWorkbookData =
    snapshot ?? { id: opts.workbookId, sheetOrder: ['s1'], sheets: { s1: { id: 's1', name: 'Sheet1', cellData: {} } } }
  editor.load(data)

  return {
    async save() {
      const data = editor.getData()
      const bytes = new TextEncoder().encode(JSON.stringify(data))
      const snap = await api.uploadSnapshot(opts.workbookId, bytes, { reason: 'manual' })
      return { id: snap.id }
    },
    exportXlsx() { return univerJsonToXlsx(editor.getData()) },
    destroy() { editor.destroy(); ws.close() },
  }
}

export { univerJsonToXlsx, xlsxToUniverJson }
```

- [ ] **Step 20.3: Export**

Edit `packages/core/src/index.ts`:

```ts
export { mountWorkbookEditor, type MountOpts, type MountHandle } from './mount'
```

- [ ] **Step 20.4: Run — expect pass**

```bash
pnpm --filter @ensemble/core test --coverage
```

Expected: PASS. Coverage ≥ 90% on `src/`.

- [ ] **Step 20.5: Commit**

```bash
git add packages/core
git commit -m "feat(core): mountWorkbookEditor() top-level wiring"
```

> **🟢 Milestone 5 checkpoint** — `pnpm -r test --coverage` from root. Both `core` and `server` should clear 90% lines. If `core` is short, target untested branches in `api-client.ts` (network errors) and `mount.ts` (no-snapshot path).

---

# Milestone 6 — Framework bindings + Demo + E2E

## Task 21: `@ensemble/react` `<WorkbookEditor />`

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/vitest.config.ts`
- Create: `packages/react/src/index.ts`
- Create: `packages/react/src/WorkbookEditor.tsx`
- Create: `packages/react/test/WorkbookEditor.test.tsx`

- [ ] **Step 21.1: Package + tsconfig**

Create `packages/react/package.json`:

```json
{
  "name": "@ensemble/react",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@ensemble/core": "workspace:*"
  },
  "devDependencies": {
    "@ensemble/core": "workspace:*",
    "@testing-library/react": "16.0.1",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "jsdom": "25.0.1",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

Create `packages/react/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "jsx": "react-jsx" },
  "include": ["src"]
}
```

Create `packages/react/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'jsdom' } })
```

- [ ] **Step 21.2: Failing test**

Create `packages/react/test/WorkbookEditor.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WorkbookEditor } from '../src/WorkbookEditor'

vi.mock('@ensemble/core', () => ({
  mountWorkbookEditor: vi.fn(async () => ({
    save: vi.fn(),
    exportXlsx: vi.fn(() => new Uint8Array()),
    destroy: vi.fn(),
  })),
}))

describe('<WorkbookEditor />', () => {
  it('calls mountWorkbookEditor with the right props', async () => {
    const { container } = render(
      <WorkbookEditor
        workbookId="w1"
        apiBaseUrl="https://api"
        wsBaseUrl="wss://api"
        token={async () => 't'}
      />
    )
    const { mountWorkbookEditor } = await import('@ensemble/core')
    expect(mountWorkbookEditor as unknown as { mock: unknown }).toBeDefined()
    expect(mountWorkbookEditor).toHaveBeenCalledWith(
      expect.objectContaining({ workbookId: 'w1', apiBaseUrl: 'https://api' })
    )
    expect(container.querySelector('.ensemble-workbook-root')).toBeTruthy()
  })
})
```

Run: expect FAIL.

- [ ] **Step 21.3: Implement component**

Create `packages/react/src/WorkbookEditor.tsx`:

```tsx
import { mountWorkbookEditor, type MountHandle } from '@ensemble/core'
import { useEffect, useRef } from 'react'

export interface WorkbookEditorProps {
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
  className?: string
  style?: React.CSSProperties
  onReady?: (handle: MountHandle) => void
}

export function WorkbookEditor(props: WorkbookEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const handleRef = useRef<MountHandle | null>(null)
  useEffect(() => {
    if (!ref.current) return
    let cancelled = false
    void mountWorkbookEditor({
      container: ref.current,
      workbookId: props.workbookId,
      apiBaseUrl: props.apiBaseUrl,
      wsBaseUrl: props.wsBaseUrl,
      token: props.token,
    }).then((h) => {
      if (cancelled) { h.destroy(); return }
      handleRef.current = h
      props.onReady?.(h)
    })
    return () => {
      cancelled = true
      handleRef.current?.destroy()
    }
  }, [props.workbookId, props.apiBaseUrl, props.wsBaseUrl])
  return (
    <div
      ref={ref}
      className={`ensemble-workbook-root ${props.className ?? ''}`}
      style={{ width: '100%', height: '100%', ...props.style }}
    />
  )
}
```

Create `packages/react/src/index.ts`:

```ts
export { WorkbookEditor, type WorkbookEditorProps } from './WorkbookEditor'
```

- [ ] **Step 21.4: Run — expect pass**

```bash
pnpm install
pnpm --filter @ensemble/react test
```

Expected: 1/1 PASS.

- [ ] **Step 21.5: Commit**

```bash
git add packages/react pnpm-lock.yaml
git commit -m "feat(react): <WorkbookEditor /> component"
```

---

## Task 22: `@ensemble/vue` `<WorkbookEditor />`

**Files:**
- Create: `packages/vue/package.json`
- Create: `packages/vue/tsconfig.json`
- Create: `packages/vue/vitest.config.ts`
- Create: `packages/vue/src/index.ts`
- Create: `packages/vue/src/WorkbookEditor.vue`
- Create: `packages/vue/test/WorkbookEditor.test.ts`

- [ ] **Step 22.1: Package**

Create `packages/vue/package.json`:

```json
{
  "name": "@ensemble/vue",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": {
    "build": "vue-tsc -p tsconfig.json && vite build",
    "typecheck": "vue-tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "peerDependencies": {
    "vue": "^3.5.0",
    "@ensemble/core": "workspace:*"
  },
  "devDependencies": {
    "@ensemble/core": "workspace:*",
    "@vitejs/plugin-vue": "5.1.4",
    "@vue/test-utils": "2.4.6",
    "jsdom": "25.0.1",
    "vite": "5.4.8",
    "vue": "3.5.10",
    "vue-tsc": "2.1.6"
  }
}
```

Create `packages/vue/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src", "jsx": "preserve" },
  "include": ["src/**/*.ts", "src/**/*.vue"]
}
```

Create `packages/vue/vitest.config.ts`:

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
export default defineConfig({ plugins: [vue()], test: { environment: 'jsdom' } })
```

- [ ] **Step 22.2: Failing test**

Create `packages/vue/test/WorkbookEditor.test.ts`:

```ts
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import WorkbookEditor from '../src/WorkbookEditor.vue'

vi.mock('@ensemble/core', () => ({
  mountWorkbookEditor: vi.fn(async () => ({
    save: vi.fn(), exportXlsx: vi.fn(() => new Uint8Array()), destroy: vi.fn(),
  })),
}))

describe('<WorkbookEditor /> (Vue)', () => {
  it('mounts and calls mountWorkbookEditor', async () => {
    const wrapper = mount(WorkbookEditor, {
      props: { workbookId: 'w', apiBaseUrl: 'a', wsBaseUrl: 'w', token: () => 't' },
    })
    await wrapper.vm.$nextTick()
    const { mountWorkbookEditor } = await import('@ensemble/core')
    expect(mountWorkbookEditor).toHaveBeenCalled()
    expect(wrapper.element.classList.contains('ensemble-workbook-root')).toBe(true)
  })
})
```

Run: expect FAIL.

- [ ] **Step 22.3: Implement SFC**

Create `packages/vue/src/WorkbookEditor.vue`:

```vue
<script setup lang="ts">
import { mountWorkbookEditor, type MountHandle } from '@ensemble/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  workbookId: string
  apiBaseUrl: string
  wsBaseUrl: string
  token: () => string | Promise<string>
}>()

const emit = defineEmits<{ ready: [handle: MountHandle] }>()
const containerRef = ref<HTMLDivElement | null>(null)
let handle: MountHandle | null = null

async function mountNow() {
  if (!containerRef.value) return
  handle?.destroy()
  handle = await mountWorkbookEditor({
    container: containerRef.value,
    workbookId: props.workbookId,
    apiBaseUrl: props.apiBaseUrl,
    wsBaseUrl: props.wsBaseUrl,
    token: props.token,
  })
  emit('ready', handle)
}

onMounted(mountNow)
onBeforeUnmount(() => handle?.destroy())
watch(() => [props.workbookId, props.apiBaseUrl, props.wsBaseUrl], mountNow)
</script>

<template>
  <div ref="containerRef" class="ensemble-workbook-root" style="width: 100%; height: 100%" />
</template>
```

Create `packages/vue/src/index.ts`:

```ts
import WorkbookEditor from './WorkbookEditor.vue'
export { WorkbookEditor }
```

- [ ] **Step 22.4: Run — expect pass**

```bash
pnpm install
pnpm --filter @ensemble/vue test
```

Expected: 1/1 PASS.

- [ ] **Step 22.5: Commit**

```bash
git add packages/vue pnpm-lock.yaml
git commit -m "feat(vue): <WorkbookEditor /> SFC"
```

---

## Task 23: Demo app + Playwright e2e "open → edit → save → reload"

**Files:**
- Create: `apps/demo/package.json`
- Create: `apps/demo/vite.config.ts`
- Create: `apps/demo/index.html`
- Create: `apps/demo/src/main.tsx`
- Create: `apps/demo/src/server-runner.ts`
- Create: `apps/demo/e2e/playwright.config.ts`
- Create: `apps/demo/e2e/open-edit-save-reload.spec.ts`
- Modify: `.github/workflows/ci.yml`

> The demo runs the real `@ensemble/server` (FsStorage + a stub IdentityAdapter that accepts any "dev:" token → fake tenant), serves a React page with `<WorkbookEditor>`, and Playwright drives the browser.

- [ ] **Step 23.1: Demo package**

Create `apps/demo/package.json`:

```json
{
  "name": "@ensemble/demo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx src/server-runner.ts",
    "dev:web": "vite",
    "dev": "concurrently \"pnpm dev:server\" \"pnpm dev:web\"",
    "build": "vite build",
    "e2e": "playwright test",
    "e2e:install": "playwright install --with-deps chromium"
  },
  "dependencies": {
    "@ensemble/core": "workspace:*",
    "@ensemble/react": "workspace:*",
    "@ensemble/server": "workspace:*",
    "@ensemble/storage-fs": "workspace:*",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@playwright/test": "1.48.0",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.2",
    "concurrently": "9.0.1",
    "tsx": "4.19.1",
    "vite": "5.4.8"
  }
}
```

- [ ] **Step 23.2: Vite config (proxies REST + WS to backend)**

Create `apps/demo/vite.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
})
```

- [ ] **Step 23.3: HTML entry**

Create `apps/demo/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ensemble demo</title>
    <style>html,body,#root{margin:0;height:100%}</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 23.4: React entry**

Create `apps/demo/src/main.tsx`:

```tsx
import { WorkbookEditor } from '@ensemble/react'
import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [workbookId, setWorkbookId] = useState<string | null>(localStorage.getItem('wbId'))

  useEffect(() => {
    if (workbookId) return
    void fetch('/api/v1/workbooks', {
      method: 'POST',
      headers: { Authorization: 'Bearer dev:u1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Demo' }),
    })
      .then((r) => r.json())
      .then((wb: { id: string }) => {
        localStorage.setItem('wbId', wb.id)
        setWorkbookId(wb.id)
      })
  }, [workbookId])

  if (!workbookId) return <div style={{ padding: 16 }}>loading…</div>
  return (
    <WorkbookEditor
      workbookId={workbookId}
      apiBaseUrl=""
      wsBaseUrl={location.origin.replace('http', 'ws')}
      token={() => 'dev:u1'}
      onReady={(h) => {
        ;(window as unknown as { ensembleSave: () => Promise<unknown> }).ensembleSave = () => h.save()
      }}
    />
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
```

- [ ] **Step 23.5: Server runner**

Create `apps/demo/src/server-runner.ts`:

```ts
import { createServer, NoopEventAdapter, type IdentityAdapter, type PermissionAdapter } from '@ensemble/server'
import { FsStorage } from '@ensemble/storage-fs'
import { mkdir } from 'node:fs/promises'
import postgres from 'postgres'

const dataDir = process.env.ENSEMBLE_DATA ?? './data'
await mkdir(dataDir, { recursive: true })

const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
await sql`INSERT INTO tenants (id, name) VALUES (${TENANT_ID}, 'demo') ON CONFLICT (id) DO NOTHING`
await sql.end()

const identity: IdentityAdapter = {
  resolveFromToken: async (token) => {
    if (!token.startsWith('dev:')) throw new Error('bad token')
    return { tenantId: TENANT_ID, userId: token.slice('dev:'.length) }
  },
}
const permission: PermissionAdapter = {
  getCapabilities: async () => ({ canView: true, canEdit: true, canShare: true, canDelete: true }),
  getMaskRules: async () => [],
}

const handle = await createServer({
  databaseUrl: process.env.DATABASE_URL!,
  identity,
  permission,
  storage: new FsStorage({ root: dataDir }),
  event: new NoopEventAdapter(),
}).listen({ port: Number(process.env.PORT ?? 3000) })

console.log(`ensemble demo server on :${handle.port}`)
```

- [ ] **Step 23.6: Playwright config + spec**

Create `apps/demo/e2e/playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: { baseURL: 'http://localhost:5173', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm dev:server',
      port: 3000,
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm dev:web',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
  timeout: 60_000,
})
```

Create `apps/demo/e2e/open-edit-save-reload.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

test('open → edit → save → reload preserves a cell value', async ({ page }) => {
  await page.goto('/')

  // Wait for Univer to mount
  await expect(page.locator('.ensemble-workbook-root')).toBeVisible({ timeout: 20_000 })
  await page.waitForTimeout(1500) // let Univer canvas paint

  // Click cell A1 area and type — Univer captures keyboard input on focused canvas
  await page.locator('.ensemble-workbook-root').click({ position: { x: 80, y: 80 } })
  await page.keyboard.type('hello-ensemble')
  await page.keyboard.press('Enter')

  // Save via window helper bound in main.tsx onReady
  const saved = await page.evaluate(async () => {
    return await (window as unknown as { ensembleSave: () => Promise<{ id: string }> }).ensembleSave()
  })
  expect(saved.id).toMatch(/.+/)

  // Reload and read back via REST
  await page.reload()
  await expect(page.locator('.ensemble-workbook-root')).toBeVisible({ timeout: 20_000 })

  const valueAfterReload = await page.evaluate(async () => {
    const wbId = localStorage.getItem('wbId')
    const res = await fetch('/api/v1/workbooks/' + wbId + '/snapshot', {
      headers: { Authorization: 'Bearer dev:u1' },
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      sheets: Record<string, { cellData: Record<string, Record<string, { v?: unknown }>> }>
    }
    const firstSheet = Object.values(data.sheets)[0]
    return firstSheet?.cellData['0']?.['0']?.v ?? null
  })
  expect(valueAfterReload).toBe('hello-ensemble')
})
```

- [ ] **Step 23.7: Run migrations once, then run e2e**

```bash
export DATABASE_URL='postgres://postgres:postgres@localhost:5432/ensemble_dev'
pnpm --filter @ensemble/server build
pnpm --filter @ensemble/server exec node dist/db/migrate.js

pnpm -r build
pnpm --filter @ensemble/demo e2e:install
pnpm --filter @ensemble/demo e2e
```

Expected: e2e passes (1 spec). If the cell click misses (Univer's toolbar height varies), bump y-coord in Step 23.6. If timing is flaky, expand `waitForTimeout` before disabling.

- [ ] **Step 23.8: Wire e2e into CI**

Edit `.github/workflows/ci.yml` — append after the `pnpm test --coverage` step:

```yaml
      - run: pnpm --filter @ensemble/server build
      - run: pnpm --filter @ensemble/server exec node dist/db/migrate.js
      - run: pnpm --filter @ensemble/demo e2e:install
      - run: pnpm --filter @ensemble/demo e2e
        env:
          DATABASE_URL: postgres://postgres:postgres@localhost:5432/ensemble_test
          CI: 'true'
```

- [ ] **Step 23.9: Commit**

```bash
git add apps/demo .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "feat(demo): single-user open-edit-save-reload e2e green"
```

> **🟢 Milestone 6 checkpoint — Sprint 1 done** — push, CI green, demo runs locally, "It opens" requirement is satisfied.

---

## Self-Review (run after the plan is written, before execution)

**1. Spec coverage** — every Sprint 1 line item is mapped:

- ✅ pnpm workspaces, TS strict, vitest, biome, Changesets — **Tasks 1-2**
- ✅ `@ensemble/core` Univer wrapper — **Task 18**
- ✅ `@ensemble/core` SheetJS ↔ Univer converter — **Task 17**
- ✅ `@ensemble/core` REST client — **Task 16**
- ✅ `@ensemble/core` WS client (connect + welcome, no collab) — **Task 19**
- ✅ `@ensemble/vue` + `@ensemble/react` `<WorkbookEditor>` — **Tasks 21-22**
- ✅ `@ensemble/server` Hono routing — **Task 6**
- ✅ `@ensemble/server` Drizzle + Postgres — **Task 5**
- ✅ `@ensemble/server` Workbook CRUD — **Task 9**
- ✅ All 4 adapter interfaces with stubs that throw — **Task 4**
- ✅ `@ensemble/storage-s3`, `@ensemble/storage-fs` — **Tasks 12-13**
- ✅ `@ensemble/webhook` — **Task 14**
- ✅ No collab, no masking — **enforced by Task 11's welcome-only WS**
- ✅ 90%+ coverage on core + server — **enforced by `vitest.config.ts` thresholds + Milestone 3 + 5 checkpoints**
- ✅ Demo: open → edit → save snapshot → reload — **Task 23**

**2. Placeholder scan** — no "TBD"/"implement later"/"similar to Task N". Univer version (Task 16.1, 18.2) flagged with explicit fallback hint. Sprint-2-deferred tables (`mutations`, `share_grants`) called out in Task 5.

**3. Type consistency** — `MountHandle`, `Editor`, `WorkbookService`, `SnapshotService`, `AppDeps`, `IdentityAdapter`, `PermissionAdapter`, `StorageAdapter`, `EventAdapter` are defined once each and referenced by identical names everywhere. `Workbook` and `Snapshot` shapes in `core/types.ts` mirror `server/db/schema.ts` columns. `WelcomeFrame` shape is consistent between server (`ws/welcome.ts`) and client (`ws-client.ts`).

**4. Known gotchas surfaced for the executor**

- Univer's exact API for snapshot extraction varies by version (Task 18.2 footnote).
- Playwright cell-click coordinates (Task 23.6) may need adjustment depending on Univer's toolbar height — bake in an explicit `data-testid` on the cell selection layer if the click misses.
- Drizzle migration file name is auto-generated; the SQL is committed but the *exact* file suffix may differ from `0001_init.sql`.
- LocalStack container is heavy on first run; CI may need a `--memory 4g` runner.
- Docker must be running locally and on CI for Testcontainers to spin up Postgres and LocalStack.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-sprint1-it-opens.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Good fit for a 23-task plan: independent commits, isolated context per package, you see green tests as each task lands.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch with checkpoints at each milestone (M1-M6). Simpler but the context window gets heavy after Milestone 3.

**Which approach?**
