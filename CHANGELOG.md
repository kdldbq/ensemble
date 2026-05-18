# Changelog

## [0.2.0-foundation] — 2026-05-17 (work in progress on `feat/v0.2-foundation`)

### Added — observability + DevX
- Structured logging via pino (`@ensemble-sheets/server`)
- `GET /healthz` expanded: db + redis pings, version, uptime, 503 on degraded

### Added — folder UX (the v0.1 pain point)
- `folder.position` + `workbook.position` columns + composite indexes (drizzle 0008)
- `folder.deletedAt`, `workbook.deletedAt` for trash sorting
- Name validation: 1-128 chars, dup-detection per-level, `MAX_FOLDER_DEPTH=10`
- New endpoints: reorder, restore, `GET /folders/trash`, batch
- React `<FolderTree>` recursive component (`role="tree"` ARIA)
  with expand/collapse persistence, F2 rename, Delete shortcut, search filter,
  breadcrumb, inline new-subfolder under selected node, three-state UI
- Optimistic delete + sonner undo toast pattern

### Added — collaboration
- New `comments` table + REST: `POST/GET/PATCH/DELETE /workbooks/:id/comments`
  (threads, replies, resolve, `parseMentions(@userId)` body parser)
- 5 new audit event types for comments
- `Capability.canComment` (defaults to canEdit), gated on POST

### Added — security
- `share_grants.passwordHash` (scrypt) + `POST /grants/:id/verify` (drizzle 0009)
- ShareDialog rewrite: clipboard auto-copy, grants list with revoke,
  collapsible expiry+password panel
- Watermark overlay (`MountOpts.watermark`) — pointer-events:none tile grid
- `MountOpts.preventCopy` — user-select:none + `@media print` hide + blur-on-blur
- `Capability.canDownload` + `canPrint` gates xlsx export
- `range_protections` table + REST (drizzle 0010)
- 2 new audit event types for protections

### Added — AI + integrations
- `LLMAdapter` contract + `NoopLLMAdapter` (host-pluggable)
- AI routes: `POST /api/v1/ai/formula`, `POST /api/v1/ai/detect-columns`
- `POST /workbooks/:id/range/read` (batch cell read API, A1 range parser)
- OpenAPI 3.1 schema served at `/api/v1/openapi.json` + Swagger UI at `/api/v1/docs`
- Webhook v2 signing (`x-ensemble-signature-v2` + `x-ensemble-timestamp`)
  with retry policy + dead-letter callback

### Added — adapter surface
- `IdentityAdapter.handoff()` for employee-leaver workflow
- `ErrorAdapter` + `NoopErrorAdapter` (Sentry-style structured error sink)
- `comments` + `protection` + `activity` services + audit events

### Added — UX foundation
- Sonner toast integration (richColors + closeButton + stack)
- CSV import via papaparse (10 MB cap)
- `<ActivityTimeline>` React component (paginated audit timeline)
- `<Drawer>` accessibility: `role="dialog"` + `aria-modal` + focus trap +
  return-focus-to-opener
- Design tokens (`@ensemble-sheets/react/ui`): spacing scale, color palette,
  radii, shadows, `<Button>`/`<Input>`/`<Select>`/`<Textarea>` primitives,
  `installCssVars()` for `:root` + global `focus-visible` ring
- `useAsyncState` hook + `<Loading>`/`<SkeletonRows>`/`<Empty>`/`<ErrorState>`
- VersionHistoryPanel polished (relative time, busy state, default name)
- OnboardingCoach v3: 5-step coachmark replacing single info wall
- Global hotkeys: Cmd/Ctrl+K folders, +H versions, +/ share, ? help
- i18n framework (i18next + react-i18next) + zh-CN/en-US locale files

### Added — compliance
- Per-tenant rate limit (`PerTenantBucket`) layered above per-session 30/s
- Per-tenant audit hash chain (drizzle 0012):
  `row_hash` + `prev_hash` + `chain_hash` SHA-256 chain in `audit_log`
  via serialized per-tenant queue — tamper-evident

### Migrations
- 0008 folder/workbook position+deletedAt + audit event types
- 0009 share_grants.passwordHash
- 0010 range_protections + 2 audit event types
- 0011 comments + 5 audit event types
- 0012 audit_log row_hash/prev_hash/chain_hash

## [0.1.0] — 2026-MM-DD

### Added
- Single-user workbook editor (`@ensemble-sheets/core` + `@ensemble-sheets/react` + `@ensemble-sheets/vue`)
- xlsx ↔ Univer JSON conversion in the browser
- `@ensemble-sheets/server` REST: workbooks, snapshots, folders, grants, versions, xlsx export
- WebSocket realtime: cell-lock + per-recipient masked broadcast
- Multi-tenant Postgres RLS (6 tables + audit log)
- `@ensemble-sheets/identity-jwks` (JWKS-based IdentityAdapter)
- `@ensemble-sheets/storage-s3` + `@ensemble-sheets/storage-fs`
- `@ensemble-sheets/webhook` for non-Node host integration
- `@ensemble-sheets/adapter-conformance` test factory package
- Last_seq reconnect replay + 30 ops/sec backpressure
- Snapshot masking with Redis pub/sub invalidation
- Two-pane masked-view + multi-context Playwright e2e
- FastAPI integration example
- Astro Starlight docs
- Apache 2.0 + NOTICE

[0.1.0]: https://github.com/kdldbq/ensemble/releases/tag/v0.1.0
