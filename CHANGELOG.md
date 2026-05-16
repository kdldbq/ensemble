# Changelog

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
