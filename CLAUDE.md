# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ensemble is an open-source collaborative spreadsheet SDK. A [Univer](https://univer.ai)-powered editor + a Hono server + pluggable adapters (identity / permission / storage / event / risk / template / OCR / PDF / LLM / agent-policy) so a host application keeps full control of auth, data, and policy. **Scope is locked to spreadsheets** — doc / slide / form / PDF / mindmap / flowchart / smart-canvas are permanent non-goals.

## Commands

The `Makefile` is the canonical entry point — it pins port assignments and runs the right dependency graph. Use it instead of remembering raw `pnpm` invocations.

| Task | Command |
|---|---|
| First-time setup (install + docker + migrate) | `make setup` |
| Run the demo (foreground, Ctrl-C stops both) | `make dev` |
| Run the demo in background | `make dev-bg` ; stop with `make dev-down` |
| Restart after touching `core` / `react` / `server` | `make restart` (kills procs, rebuilds the 3 libs, then `dev`) |
| Build everything | `make build` |
| Build only what demo needs | `make build-libs` (core + react + server) |
| Typecheck whole workspace | `make typecheck` |
| Run all unit tests | `make test` |
| Playwright e2e | `make e2e` |
| v0.1 capability audit on isolated ports | `make audit` (uses 5311/5312, does not disturb running dev) |
| Pre-ship full pipeline | `make verify` (typecheck + test + build-libs + audit) |
| Postgres + Redis containers | `make db-up` / `make db-down` |
| Docs site dev | `make docs-dev` |

Port layout: server `5301` · web `5302` · postgres `5303` · redis `5304` · audit-server `5311` · audit-web `5312`. Do not change these without updating both the Makefile and `apps/demo/docker-compose.dev.yml`.

### Targeted operations (when Make is too coarse)

```bash
# Single package test
pnpm --filter @ensemble-sheets/core test
# Single test file
pnpm --filter @ensemble-sheets/core exec vitest run test/pivot.test.ts
# Single package build (use this after editing one lib instead of `make build`)
pnpm --filter @ensemble-sheets/server build
# Lint (Biome; --write to fix)
pnpm lint
pnpm lint:fix
# Run a server integration test (requires docker + 5303/5304 up)
pnpm --filter @ensemble-sheets/server exec vitest run test/integration/<name>.int.test.ts
```

Integration tests under `packages/server/test/integration/*.int.test.ts` spin up testcontainers and need Docker. If `pnpm -r test` fails on `migrate.js`, run `make setup` once — it builds the server and runs migrations.

## Architecture

### Topology

```
Browser (React / Vue) ──► @ensemble-sheets/core ──► Univer editor
       │ HTTP                  │ WebSocket
       ▼                       ▼
@ensemble-sheets/server (Hono + drizzle + Redis)
       │
       ├── REST routes        (folders / workbooks / snapshots / versions / grants /
       │                       activity / comments / protections / ai / admin / range /
       │                       templates / export.xlsx / export.pdf / metrics / openapi)
       ├── WebSocket bridge   (cell-region locks → mutation broadcast with per-recipient mask)
       ├── Adapters           (identity, permission, storage, event, llm, risk, oauth,
       │                       agent-policy, ocr, pdfRenderer, template, error)
       └── NotificationBus    (in-process pub/sub for @mention real-time push)
```

The data plane sits on Postgres (drizzle schema in `packages/server/src/db/schema.ts`) with **Postgres RLS** enforcing tenant isolation (ADR-0001) — every request runs in a transaction with `SET LOCAL app.tenant_id`. Redis backs cell-region locks (`SET NX EX`, 30s TTL) and mask-cache pub/sub invalidation.

### The two non-obvious load-bearing ideas

1. **Cell-region locks instead of CRDT** (ADR-0002). When two users hit the same cell concurrently, ensemble does *not* last-write-wins — the server arbitrates via a Redis lock and rejects the loser with `lock_required`. The CRDT alternative ships as a separate adapter contract in `@ensemble-sheets/crdt` (LWW reference impl; a Yjs binding will land here in a future sprint) — never mix the two on the same workbook.
2. **Per-recipient mask broadcast.** Every outbound `apply_mutation` frame is re-rendered through the recipient's *current* `MaskRuleCache` entry (no cached snapshot ever leaves the server unmasked). Same applies to `versions/diff` (4.5 fix) and `export.{xlsx,pdf}` routes. **If you add any code path that emits snapshot bytes to a user, you must apply `applyMaskRules(data, await services.masks.get(idCtx, wbId))` first.**

### Mount lifecycle (client)

`mountWorkbookEditor(opts)` → returns `MountHandle`. It owns: Univer editor, the `WsClient` (with auto-reconnect + exponential backoff + `last_seq=` replay), a custom-function registry, a 30 Hz cursor heartbeat throttle, an optional IndexedDB offline mutation queue (drained on every keepalive tick), and watermark / preventCopy overlays. The handle exposes:

- `save / exportXlsx / destroy`
- `onMutationApplied / onPresence / onSaved / onConnectionChange / onNotification`
- `readRange(A1) / setFrozen / registerCustomFunction`
- `connectionState()` ∈ `connecting | connected | reconnecting | offline`

`WorkbookEditor.tsx` clears the container's children before *and* after mount to defend against Univer leaving canvas siblings during fast workbook-id switches (F7.1).

### Adapter contract pattern

Adapters live under `packages/server/src/adapters/`. Each has a TS interface + a default implementation (typically `Noop*` / `NotImplemented*`). Hosts pass concrete instances into `createServer({...})`; routes pull them from `c.get('deps')`. **When adding a new optional capability, follow this shape**: optional adapter on `AppDeps` → REST route returns a 503 with a helpful notice when the adapter is absent (see `templates.ts`). A portable test pack lives in `@ensemble-sheets/adapter-conformance` — any host implementation should pass it.

### TypeScript strictness

`tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. The last two bite the most:

- Optional fields must be conditionally spread, never set to `undefined`: `{ ...(x ? { key: x } : {}) }`.
- `import type` is required for type-only imports (Biome enforces `useImportType` as error).

### Auto-memory + Fact-Forcing gate

This repo uses an ECC GateGuard hook that intercepts the first `Edit`/`Write` per file and requires a 4-fact prefix (importers / public surface / data I/O / verbatim user instruction). Don't fight it — present the facts succinctly before each new-file or first-touch edit. Recovery: `ECC_GATEGUARD=off` or `ECC_DISABLED_HOOKS=pre:edit-write:gateguard-fact-force`. Memory store at `~/.claude/projects/-Users-cedric-Projects-localized-ensemble/memory/`.

## Critical conventions

- **Scope lock**: sheets only. Reject doc/slide/form/PDF features even when "while we're here it'd be easy" — the user has flagged this as a hard rule.
- **Mask before emit**: any snapshot leaving the server passes through `applyMaskRules` against the *current* viewer's rules. The historic snapshot's original mask is never trusted.
- **Defense in depth at three layers**: HTTP (`requireCapability`), WS (`capabilities.canEdit` re-check on every frame in `ws/session.ts`), and client (`MountOpts.capabilities` only shapes UX). Never collapse to one layer.
- **Never amend pushed commits.** Create a new commit; the pre-existing repo history is part of the audit trail.
- **Migrations** live in `packages/server/drizzle/`. After editing `schema.ts`, run `pnpm --filter @ensemble-sheets/server exec drizzle-kit generate` and commit the generated `*.sql`. Apply with `make migrate`.
- **No new heavy dependencies without a reason** — the metrics + tracing primitives are hand-rolled specifically to avoid pulling the full OTEL tree; follow the same instinct.

## Key reference docs

- `docs/specs/2026-05-15-ensemble-design.md` — design spec
- `docs/decisions/0001-rls-vs-app-level-tenancy.md` — why Postgres RLS
- `docs/decisions/0002-cell-lock-vs-crdt.md` — why cell-region locks
- `docs/A11Y.md` — WCAG 2.2 AA + VPAT 2.5 status
- `docs/research/2026-05-17-tencent-docs-vs-ensemble.md` — competitive matrix
- `docs/research/2026-05-17-implementation-backlog.md` — 150-item backlog with priorities
