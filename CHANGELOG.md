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
