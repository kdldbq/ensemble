# PR Review: #1 — feat(v0.2): close foundation backlog + Tencent parity + zh-CN UI

**Reviewed**: 2026-05-18
**Author**: kdldbq (self-authored; this review is best-effort self-audit)
**Branch**: feat/v0.2-foundation → main
**Decision**: **REQUEST CHANGES**

## Summary

Substantial v0.2 work — 40 commits, 178 files, +22,162 / −418 — closes most of the enterprise + Tencent-parity backlog. The architecture (cell-region locks, per-recipient mask broadcast, three-layer defense-in-depth, RLS tenancy) is sound and **every snapshot-emitting path correctly calls `applyMaskRules`** (verified: `versions.ts`, `export-pdf.ts`, `export-xlsx.ts`, `snapshots.ts`, `welcome.ts`, `mutation-broadcaster.ts`). Type check and build pass clean across all 17 workspace packages.

However, two validation gates fail and one HIGH design issue in tracing breaks distributed-trace correlation. None block the spreadsheet feature work itself — they're remediation items before the whole branch ships to `main`.

## Findings

### CRITICAL
None.

### HIGH

1. **`packages/server/src/tracing.ts:188-189` — every span gets a fresh random traceId, breaking trace correlation**
   `buildOtlpPayload` does `traceId: randomHex(32), spanId: randomHex(16)` per span, regenerated at OTLP export time. This means every span in the batch reports a unique `traceId`, so siblings in the same logical request appear as 32 separate traces in the collector. Any distributed-tracing UI (Jaeger/Tempo/Honeycomb) loses the ability to group request-scoped work.
   *Fix*: generate `traceId` once per logical trace (per request span) and propagate to children. At minimum, document that this tracer is single-span only and not OTLP-correlation-compatible.

2. **Validation gate: `pnpm lint` fails with 222 Biome errors**
   Diagnostics span import ordering, type-only imports, unused vars. Most appear mechanically auto-fixable via `pnpm biome check --fix --unsafe`. Many are not from the session's hotfix commits — they accumulated across the 40-commit foundation work — but the branch lint is red and `make verify` will fail.
   *Fix*: `pnpm biome check --fix` for the safe subset; review the remaining diagnostics manually; ensure CI runs lint as a gate.

3. **Validation gate: `pnpm -r test` fails in `packages/scim-adapter`**
   `Workspace config file "../../vitest.workspace.ts" references a non-existing file or a directory: /…/packages/scim-adapter/packages/core` — vitest resolves workspace paths relative to scim-adapter's cwd, fabricating `packages/scim-adapter/packages/core`. `scim-adapter` (and likely `mcp-server`) lack their own `vitest.config.ts`, so they auto-discover the root workspace and crash. Affects the recursive test command.
   *Fix*: add `vitest.config.ts` per new package (mirror the shape of `packages/crdt-yjs/vitest.config.ts`), OR add `packages/scim-adapter` + `packages/mcp-server` to the workspace list at `vitest.workspace.ts` so vitest finds them as workspace projects rather than trying to nest the workspace inside them.

### MEDIUM

4. **`packages/server/src/services/password.ts:18-24` — scrypt hash format lacks cost parameter**
   Output is `scrypt$<salt_hex>$<derived_hex>`. If you later bump scrypt's `N` cost factor (currently Node's default 16384), `verifyPassword` has no way to know which `N` to use for legacy hashes → all old passwords break. Recommend `scrypt$<N>$<r>$<p>$<salt>$<derived>` format (matches OpenSSL / passlib convention) so future migrations are non-breaking.

5. **`packages/server/src/services/ip-allowlist.ts:98-106` — `clientIpFromHeaders` trust model is misconfiguration-prone**
   Trusts XFF first hop unconditionally. The JSDoc warns to sanitize at nginx (`real_ip_header`), but with no in-code enforcement an unsanitized deployment lets attackers spoof IP. Consider a `trustedProxyHops` config or refuse to read XFF if a `Forwarded` (RFC 7239) header isn't present.

6. **`packages/server/src/services/grant-service.ts:107-110` — workbook-owner shortcut doesn't verify tenant boundary**
   `if (ctx.workbookOwnerId === ctx.identity.userId) return full-capability`. No assertion that `identity.tenantId` matches the workbook's tenant. Defensive: combine with a tenant check or trust that the caller already RLS-filtered the lookup.

7. **`packages/server/src/services/grant-service.ts:6-10` — public_link tokens stored cleartext (acknowledged)**
   JSDoc flags this as Sprint 2 design, with HMAC wrap planned for Sprint 4. Acceptable for the present milestone but should land before any deployment with non-trivial threat model. Track as an issue.

8. **`packages/server/src/ws/session.ts:16-19` — session capabilities cached for the lifetime of the WS connection**
   Revoking a grant does not invalidate active sessions; users keep edit/view rights until they disconnect. The behavior is documented, but the operational risk (revocation isn't real-time) should be more visible — at minimum, surface "active sessions" in the admin dashboard so an admin can force-kick.

9. **`packages/server/drizzle/0012_tense_madrox.sql` — audit-log hash chain backfilled to empty string**
   Adds `row_hash`, `prev_hash`, `chain_hash` as `NOT NULL DEFAULT ''`. Existing audit rows now carry empty hashes; any chain-validation check on legacy rows will treat the chain as broken. Either backfill in the migration (compute hashes for existing rows from oldest to newest), or document that chain validation only applies from the migration timestamp onward, and have the validator skip rows where `chain_hash = ''`.

10. **`packages/server/src/services/dlp-rules.ts:128-130` — `scanPayload` skips strings outside `[5, 10_000)`**
    Cell values larger than 10 KB are never scanned. Rare but possible (a multi-line note pasted into one cell). Either lift the cap, make it configurable, or split large strings into chunks before scanning.

11. **`packages/scim-adapter/src/index.ts:200-202` — catch-all returns raw `e.message` as SCIM detail**
    Internal errors (DB constraint names, stack hints) get serialized into the SCIM response body and shipped to the IdP. Replace with a sanitized message + log the original server-side.

12. **`packages/crdt-yjs` — package named for Yjs but only ships LWW reference, no Yjs wire compat**
    `InMemoryLwwCrdtAdapter` uses a JSON-encoded LWW-Element-Map, not the Yjs binary protocol. The JSDoc acknowledges the gap, but the package name will mislead adopters who assume Yjs interop. Either rename to `@ensemble-sheets/crdt` until Yjs lands, or implement the Yjs binding now.

### LOW

13. `packages/server/src/services/password.ts:39-44` — `try { Buffer.from(saltHex, 'hex') }` is a no-op. Node's `Buffer.from('garbage', 'hex')` silently truncates rather than throwing; the length-zero guard on line 45 is what actually catches malformed hex. Remove the try/catch.

14. `packages/server/src/ws/session.ts:79-87` — `release_lock` has no explicit `capabilities.canEdit` re-check. The lock manager rejects releases by non-owners, so it's implicitly safe, but a one-line `if (!capabilities.canEdit) return forbidden` matches the explicit pattern at acquire/submit_mutation sites for consistency.

15. `packages/server/src/ws/session.ts:120-129` — DLP `risk.alert` errors silently swallowed (no log, no metric). A broken alert sink is invisible to operators. Add a `console.error` or wire a counter.

16. `packages/scim-adapter/src/index.ts:142-143` — `Number(startIndex)` / `Number(count)` accept `NaN`, negatives. Clamp to `Math.max(1, ...)` to avoid surprising SCIM list behavior.

17. `packages/mcp-server/src/index.ts:138-141` — `list_workbooks` tool just returns a note string. Either implement or remove from `TOOLS` until ready; LLM agents will get confused.

18. `packages/crdt-yjs/src/index.ts:124-128` — `merge(update: Uint8Array)` parses JSON without schema validation. Malformed remote update can crash or corrupt state. Add `Array.isArray(parsed)` + per-op shape check.

19. `packages/server/src/tracing.ts:142-147` — defensive `'unref' in handle && typeof handle.unref === 'function'` is over-cautious; `setInterval` always returns a `Timeout`-like in Node. Trim.

20. `packages/server/src/tracing.ts:128-139` — `flush` silently drops spans when buffer exceeds 5000 after a failed export. Log a warning at least, or expose a counter.

21. `packages/ocr-tesseract/src/index.ts:23-24` — `const tess: any = await import(...)` masks type-mismatch breakage when tesseract.js ships a major version. Acceptable for an optional adapter but worth a comment pinning the expected `.recognize` shape.

## Mask-path audit (no findings — explicit note)

Every code path that emits workbook snapshot bytes to a user was checked for `applyMaskRules`:

| Path | Mask applied at |
|---|---|
| `http/routes/snapshots.ts` | `:68`, `:92` |
| `http/routes/versions.ts` (diff) | `:89-90` (before `diffSnapshots`) |
| `http/routes/export-xlsx.ts` | `:31` |
| `http/routes/export-pdf.ts` | `:35` (before `renderWorkbookHtml`) |
| `ws/welcome.ts` (snapshot + replay) | `:54`, `:93` |
| `realtime/mutation-broadcaster.ts` | `:45` (per recipient) |

CLAUDE.md's load-bearing "mask before emit" invariant is respected.

## Validation Results

| Check | Result | Notes |
|---|---|---|
| Type check (`pnpm -r typecheck`) | **Pass** | All 17 workspace packages clean |
| Lint (`pnpm lint`) | **Fail** | 222 Biome errors. Mostly mechanical; most fixable via `--fix` |
| Tests (`pnpm -r test`) | **Partial fail** | Core 87/87 ✓, demo 16/16 ✓, scim-adapter blocked at startup (vitest workspace misresolution); other packages all pass |
| Build (`make build-libs`) | **Pass** | core / react / server all built clean |

## Files Reviewed (sampled)

178 files total. Read in full for review:

- **Security / auth**: `services/password.ts`, `services/ip-allowlist.ts`, `services/dlp-rules.ts`, `services/grant-service.ts`, `services/protection-service.ts`, `ws/session.ts`
- **Snapshot-emit paths**: `services/version-diff.ts`, `services/pdf-render-service.ts`, route handlers `versions.ts`, `export-pdf.ts`, `snapshots.ts`, `ws/welcome.ts`, `realtime/mutation-broadcaster.ts`
- **New packages**: `scim-adapter/src/index.ts`, `mcp-server/src/index.ts`, `crdt-yjs/src/index.ts`, `ocr-tesseract/src/index.ts`
- **Observability**: `tracing.ts`
- **Migrations**: `0008` through `0013` SQL (all 6 reviewed for safety)
- **Schema**: `db/schema.ts` (first 100 lines reviewed)

Not read in full (sampled / skipped): test files (logic verified by test counts), deploy/Helm/Terraform manifests, CI workflow YAML, docs, generated lockfile.

## Recommended Path to Merge

1. **`make lint` clean** — run `pnpm biome check --fix` for the auto-fixable subset, then triage the rest. (Highest blast radius: gets the validation gate green.)
2. **Fix `scim-adapter` + `mcp-server` test entry** — add per-package `vitest.config.ts` or list them in `vitest.workspace.ts`. Confirm `pnpm -r test` exits 0.
3. **Decide tracing fix** — either fix `traceId` propagation (real OTLP correlation) or rename/document the tracer as single-span only.
4. **Triage MEDIUMs as follow-up issues** — none block this PR if there's product agreement that the items (e.g., session-revocation latency, public_link cleartext, audit-log chain backfill) are Sprint-N items. File them in the tracker so they don't get lost in PR-review noise.

LOW items: optional, fix when adjacent code is touched.
