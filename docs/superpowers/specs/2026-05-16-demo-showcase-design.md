# Public Demo Showcase — Design

- **Status**: Approved by user 2026-05-16 (user opted out of formal review loop, see HARD-GATE note below)
- **Date**: 2026-05-16
- **Owner**: kdldbq

## 1. Goal

`apps/demo` ships only a double-pane editor today. After this work, the demo can sit on a public URL and let any visitor click every v0.1 capability the backend already supports.

Capabilities that must be reachable from the UI:

1. Folder tree (create / rename / move / delete)
2. Version history (list / create named / restore)
3. xlsx download
4. xlsx upload
5. Share grants (grant a user or public link, choose permission)
6. Presence (avatars of users in current room)
7. Mask differences (admin sees raw, viewer sees `***`)
8. "Open another user" (multi-tab multi-identity for visitors)
9. Onboarding hint (one coachmark on first visit)

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | Persona is **derived from `userId`** by a pure hash → admin / editor / viewer | Keeps `PermissionAdapter` a pure function of identity; matches product architecture; deterministic across reloads |
| D2 | Each visitor gets a **per-visitor sandbox workbook** (cookie-pinned) plus a globally **shared public room** workbook | Visitor can play freely without trashing others; one shared room provides the "real strangers" moment |
| D3 | Default UI is **dual editor** (admin pane + visitor's persona pane) | One glance shows mask + collab |
| D4 | Layout is **clean toolbar + drawers** (Folder/Version are not always-on panels) | Avoids 3-column noise; matches Option 2 visual |
| D5 | Daily reset is a **GitHub Actions cron** hitting `POST /api/demo/reset` with a secret in header | Survives server restarts; rotates with GitHub secrets |
| D6 | Demo routes (`/api/demo/*`) live in `apps/demo/src/server-demo-routes.ts`, not in `@ensemble-sheets/server` | Don't pollute product package; demo helpers are not product API |
| D7 | xlsx download via `fetch + blob + a.click()` (need auth header, can't use plain `<a href>`) | Only path that preserves bearer token |
| D8 | xlsx upload is fully client-side: SheetJS → `createWorkbook` → `uploadSnapshot` | Server has no `/import` route and we don't need one |

## 3. Architecture

```
Visitor browser                        ensemble server :5301           Postgres / Redis / FS
───────────────                        ───────────────────             ─────────────────────
 main.tsx (React SPA)                   Hono app
  └ <DemoShell>                          ├ /api/v1/*    (product)
     ├ <TopBar>                          │   workbooks, folders,
     │  ├ Open / Save                    │   snapshots, grants,
     │  ├ Upload xlsx                    │   versions, export.xlsx
     │  ├ Download xlsx                  ├ /api/v1/ws/:wbId (WS)
     │  ├ Share dialog trigger           └ /api/demo/* (extraRoutes)
     │  ├ "Open another user"              ├ POST /whoami
     │  ├ Persona switcher                 └ POST /reset (token-gated)
     │  └ Presence avatars              ↑
     ├ <FolderDrawer>                   │
     ├ <VersionDrawer>                  │
     ├ <ShareDialog>                    │ Bearer dev:<visitorId>
     ├ <PublicRoomBanner>               │
     ├ <OnboardingCoach>                │
     └ <EditorPair>                     │
        ├ Pane A: visitor persona       │
        └ Pane B: a contrasting persona │
                                        │
   ┌─ visitor cookie ─┐                 │
   │ ev_visitor=...   │ ── fetch ───────┘
   └──────────────────┘

 GitHub Actions cron (.github/workflows/demo-reset.yml)
  └ 00:00 UTC daily → POST https://<deploy>/api/demo/reset
                       header: X-Demo-Reset-Token: $SECRET
```

## 4. Files

### Added — server side

- `apps/demo/src/persona.ts` — pure `idToPersona(userId): 'admin' | 'editor' | 'viewer'`, plus `capabilitiesFor(persona)` and `maskRulesFor(persona)`
- `apps/demo/src/server-demo-routes.ts` — Hono router with `/api/demo/whoami` and `/api/demo/reset`
- `apps/demo/test/persona.test.ts` — vitest unit tests for derivation + stability
- `apps/demo/test/server-demo-routes.test.ts` — vitest integration tests for the two endpoints

### Added — client side

- `apps/demo/src/lib/visitor.ts` — `useVisitor()` hook fetching `/api/demo/whoami` to get `{ userId, persona, sandboxWbId }`
- `apps/demo/src/lib/xlsx-io.ts` — `downloadXlsx(api, wbId, name)` and `uploadXlsx(api, file, name) → workbookId`
- `apps/demo/src/components/DemoShell.tsx`
- `apps/demo/src/components/TopBar.tsx`
- `apps/demo/src/components/FolderDrawer.tsx` — wraps `FolderNavigator`
- `apps/demo/src/components/VersionDrawer.tsx` — wraps `VersionHistoryPanel`
- `apps/demo/src/components/ShareDialog.tsx`
- `apps/demo/src/components/PublicRoomBanner.tsx`
- `apps/demo/src/components/OnboardingCoach.tsx`
- `apps/demo/src/components/EditorPair.tsx`

### Modified

- `packages/server/src/http/app.ts` — `BuildAppOpts.extraRoutes?: Hono<AppEnv>` mounted via `app.route('/', extraRoutes)` after main routes
- `packages/server/src/server.ts` — `CreateServerOpts.extraRoutes?` forwarded
- `apps/demo/src/server-runner.ts` — replace hardcoded admin/viewer permission adapter with `capabilitiesFor` / `maskRulesFor`; ensure tenant + public-room workbook exist on boot; mount `server-demo-routes`
- `apps/demo/src/main.tsx` — render `<DemoShell>`
- `apps/demo/package.json` — add `xlsx` dependency

### Added — repo

- `.github/workflows/demo-reset.yml`

## 5. Data Flow Details

### 5.1 Visitor identity

```
1. Browser opens demo page.
2. main.tsx calls fetch('/api/demo/whoami', { credentials: 'include' }).
3. Server checks ev_visitor cookie.
   - missing  → generate uuid, set HttpOnly cookie (SameSite=Lax), insert sandbox workbook,
                return { userId, persona, sandboxWbId, publicRoomWbId }
   - present  → look up sandbox workbook, return same shape
4. Hook stores result in React state.
5. All ApiClient calls use Bearer dev:<userId> (existing identity adapter accepts dev:* tokens).
```

### 5.2 "Open another user"

Generates `?u=<new uuid>` URL → `window.open` in new tab.
Server side: if `?u=` is present, override cookie issuance and pin to that userId.

### 5.3 xlsx round trip

Download: `fetch('/api/v1/workbooks/:id/export.xlsx', { headers: { Authorization } })` → `blob` → `URL.createObjectURL` → click hidden `<a>` → revoke.

Upload: `<input type="file">` → `arrayBuffer` → `xlsxToUniverJson(bytes)` (already in core) → `api.createWorkbook(name)` → `api.uploadSnapshot(wb.id, JSON.stringify(data).encode())`.

### 5.4 Reset

```
POST /api/demo/reset
Header: X-Demo-Reset-Token: $DEMO_RESET_TOKEN

Action: DELETE FROM workbooks / folders / snapshots / mutations / share_grants
        WHERE tenant_id = DEMO_TENANT_ID
        AND id NOT IN (PUBLIC_ROOM_WB_ID)
        --  then truncate the public room workbook's snapshot (keep workbook row)
```

## 6. Error Handling

- `/api/demo/whoami` 5xx → DemoShell shows a "demo unavailable, retry" banner; everything else stays mounted in "loading" state.
- `/api/demo/reset` wrong token → 401; right token but DB error → 500 with body, GitHub Action surfaces in CI log.
- xlsx upload too large (>5 MB) → client-side reject before POST.
- Share dialog grant failure → toast.

## 7. Testing

- Vitest unit: `persona.test.ts` — same userId always same persona; distribution roughly even.
- Vitest integration: `server-demo-routes.test.ts` — whoami issues + reuses cookie; reset wipes only demo tenant; reset rejects without token.
- Existing Playwright e2e (`apps/demo/e2e/*`) — keep passing. No new e2e for now (manual smoke covers showcase visual).
- Manual smoke (verification step) — click through every TopBar / drawer / dialog.

## 8. HARD-GATE notes

Per superpowers brainstorming skill, the spec is normally reviewed by the user before implementation begins. The user explicitly elected to skip the review loop and authorize implementation under the recommendations above. This document is being committed as a record of what was built and why.
