# ensemble

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

ensemble is an open-source collaborative spreadsheet platform. It embeds a [Univer](https://univer.ai)-powered editor into any host application and exposes pluggable adapters for identity, permissions, data masking, and blob storage — so each host controls its own auth and data policy.

**Status:** Sprint 3 ("Realtime") complete. Cell-lock + broadcast collab over WebSocket with monotonic mutation oplog, per-recipient masked broadcast, Redis-backed locks, 5s/15s presence, last_seq reconnect replay, and 30 ops/sec token-bucket backpressure. Sprint 4 (polish + ship) next.

## Quickstart

Prerequisites: Node 20+, pnpm 9, Docker (for integration tests).

```bash
pnpm install
pnpm -r test
pnpm lint
```

## Packages

| Package | Purpose |
|---|---|
| `@ensemble/core` | Univer editor bootstrap, sheet codec (import/export XLSX) |
| `@ensemble/server` | Hono HTTP + WebSocket server, Drizzle/Postgres persistence, adapter contracts |
| `@ensemble/react` | React component wrapping the core editor |
| `@ensemble/vue` | Vue 3 component wrapping the core editor |
| `@ensemble/identity-jwks` | JWKS-based IdentityAdapter (resolves tenant + user from JWT) |
| `@ensemble/storage-fs` | Local-filesystem blob storage adapter (dev / single-node) |
| `@ensemble/storage-s3` | AWS S3 blob storage adapter |
| `@ensemble/webhook` | Outbound webhook event adapter |
| `@ensemble/demo` | Demo app: single-tenant dev server + Vite front-end |

## Documentation

- Full design spec: [`docs/specs/2026-05-15-ensemble-design.md`](./docs/specs/2026-05-15-ensemble-design.md)
- Sprint 1 implementation plan: [`docs/superpowers/plans/2026-05-15-sprint1-it-opens.md`](./docs/superpowers/plans/2026-05-15-sprint1-it-opens.md)

## License

Apache 2.0 — see [LICENSE](./LICENSE).
