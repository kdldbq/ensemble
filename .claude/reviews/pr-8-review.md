# PR Review: #8 — feat(core,server): single-user mode via collab: false

**Reviewed**: 2026-05-19
**Author**: kdldbq
**Branch**: feat/single-user-mode → main
**Decision**: APPROVE (posted as COMMENT — self-PR cannot use --approve)

## Summary

Clean, scope-disciplined opt-in flag (`collab?: boolean`, default `true`) on both `createServer` and `mountWorkbookEditor` that disables every real-time collab subsystem (Redis, WS bridge, cell-locks, presence, broadcaster, room registry, notifications, session registry, offline queue) without touching the data plane or breaking back-compat. Logic change is small; most of the server.ts diff is reformatter indentation. The `buildCollabInfra()` extraction (added in the follow-up simplify commit) eliminates a 9-clause narrowing assert and tightens the lifecycle model — every collab subsystem is now either fully constructed or fully absent. 6 new tests, 2 shared test-helper modules. No regressions; no API breakage.

## Findings

### CRITICAL

None.

### HIGH

None.

### MEDIUM

- **`packages/server/src/server.ts:261`** — dead defensive `if (notifications)` check. After the `buildCollabInfra` refactor, `notifications` is destructured from `collab` inside the `if (collab)` block, so it's already non-null when this guard runs. Removing the wrapping `if` (just call `notifications.subscribe(...)`) makes the code match the actual invariant. Minor.

- **`packages/server/test/unit/single-user-server.test.ts:22-28`** — the "no Redis client created" assertion is signal-dependent, not contract-checked. The test comment correctly notes that a `127.0.0.1:1` connection attempt would surface in test logs if `collab:false` leaked to Redis, but vitest doesn't fail on stderr. Stronger: `vi.mock('../../src/redis/client', ...)` with a spy on `createRedis` and `expect(createRedisSpy).not.toHaveBeenCalled()`. Current shape is acceptable since the contract is also covered by the type-system guarantee (`collab?.redis` is the only access point), but the stronger assertion would catch regressions automatically.

### LOW

- **`packages/server/src/server.ts:156-311`** — the WS handler closure is ~155 lines and lives inside the `if (collab)` block. Extracting it to `function buildWsHandler(collab, opts, deps, getBuiltApp)` (mirroring the `buildCollabInfra` win) would tighten readability further. Not a regression — this size predates the PR — but the `buildCollabInfra` pattern points naturally toward this next step.

- **`packages/core/src/mount.ts:182`** — `new WsClient(...)` is still constructed when `collab=false`. The constructor only allocates listener arrays + stores opts (no IO), so overhead is trivial. The minimal-change approach is the right call; flagging only because future readers might assume the WsClient is fully bypassed.

- **`packages/core/src/mount.ts:187`** — the `_wsConnect` test stub is intentionally inside the `if (opts.collab !== false)` block, meaning collab:false tests can't exercise an alternate connect path via the stub. The new test (`mount-single-user.test.ts:31-33`) asserts this explicitly, but the relationship between `collab` and `_wsConnect` could use a one-line comment on `_wsConnect`'s JSDoc to prevent future confusion.

- **PR body** — the "Notes for reviewer" section still mentions the 9-clause narrowing assert ("explicit narrowing asserts so the WS handler closure sees non-undefined types for `redis`, `sessionRegistry`, `roomRegistry`, etc.") — that pattern was replaced in commit `0f2ce86` by `buildCollabInfra`. Minor — the description is now slightly out-of-sync with the head.

## Validation Results

| Check | Result |
|---|---|
| Type check (`pnpm typecheck`) | Pass — clean across all 13 packages |
| Lint (`pnpm lint`) | Pass — 0 errors / 0 warnings / 0 infos |
| Tests (`pnpm -r test`) | Pass — server 205/205, core 90/90, react 11/11, vue 9/9, demo 16/16, identity-jwks 10/10, adapter-conformance 6/6, ocr-tesseract 6/6, webhook 3/3, storage-fs 3/3, storage-s3 1/1 |
| Build | Skipped — covered transitively by tests |

The vitest "Failed to find Response internal state key" lines on the server test output are framework-internal teardown noise, not test failures.

## Files Reviewed

| File | Change |
|---|---|
| `CLAUDE.md` | Modified — adds 1-paragraph Single-user mode subsection |
| `packages/core/src/mount.ts` | Modified — `collab` flag on `MountOpts`; gates `ws.connect()` + `onWsConnected` + offline cache |
| `packages/core/test/_helpers.ts` | Added — `makeFakeEditor()` shared test fixture |
| `packages/core/test/mount-single-user.test.ts` | Added — 3 tests covering single-user mode |
| `packages/core/test/mount.test.ts` | Modified — uses shared `makeFakeEditor` |
| `packages/server/src/server.ts` | Modified — `buildCollabInfra()` extraction; `collab` flag on `CreateServerOpts`; WS bridge gated |
| `packages/server/test/unit/_stubAdapters.ts` | Added — shared identity/permission/storage/event stubs + `STUB_DATABASE_URL` |
| `packages/server/test/unit/buildApp-bootstrap.test.ts` | Modified — uses shared stubs |
| `packages/server/test/unit/single-user-server.test.ts` | Added — 3 tests covering `createServer({collab:false})` |

## Notes

- The `buildCollabInfra()` lifecycle model is genuinely improved over the first commit's `if (!a || !b || ...) throw` pattern. The discriminated-undefined idiom (`const collab = ... ? buildCollabInfra(...) : undefined`) gives the WS block natural narrowing via destructure with no per-field asserts.
- Back-compat preserved: every existing `createServer({...})` and `mountWorkbookEditor({...})` call continues to behave identically (collab defaults to `true`).
- Defense-in-depth invariant preserved: the WS bridge, when present, still enforces tenant + capability checks on every frame; single-user mode just declines to register the bridge at all (Hono returns 404 for `/api/v1/ws/:workbookId`).
- Out of scope (explicitly per PR body, acceptable): a `core-lite` package split; an HTTP-layer middleware that 404s WS upgrade attempts (currently the route just isn't registered, which has the same effect).
