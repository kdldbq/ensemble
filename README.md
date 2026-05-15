# ensemble

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

ensemble is an open-source collaborative spreadsheet platform. It embeds a [Univer](https://univer.ai)-powered editor into any host application and exposes pluggable adapters for identity, permissions, data masking, and blob storage — so each host controls its own auth and data policy.

**Status:** Sprint 2 ("Permission + Folder") complete. Multi-tenant with Postgres RLS, JWKS identity, per-route capability enforcement, folder CRUD with cycle prevention, share grants with ancestor walk, and per-recipient snapshot masking. Sprint 3 (real-time collaboration) next.

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
