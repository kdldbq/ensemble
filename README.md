# ensemble

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](./LICENSE)

ensemble is an open-source collaborative spreadsheet platform. It embeds a [Univer](https://univer.ai)-powered editor into any host application and exposes pluggable adapters for identity, permissions, data masking, and blob storage — so each host controls its own auth and data policy.

**Status:** v0.1.0 GA. Single-user editing, multi-tenant RLS, realtime collaboration (cell-lock + per-recipient masked broadcast), version history, server-side xlsx export, 4-adapter conformance suite, docs site, FastAPI integration example. Ready for npm publish + public GitHub once §11 decisions land (product name / org / domain).

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
| `@ensemble-sheets/core` | Univer editor bootstrap, sheet codec (import/export XLSX) |
| `@ensemble-sheets/server` | Hono HTTP + WebSocket server, Drizzle/Postgres persistence, adapter contracts |
| `@ensemble-sheets/react` | React component wrapping the core editor |
| `@ensemble-sheets/vue` | Vue 3 component wrapping the core editor |
| `@ensemble-sheets/identity-jwks` | JWKS-based IdentityAdapter (resolves tenant + user from JWT) |
| `@ensemble-sheets/storage-fs` | Local-filesystem blob storage adapter (dev / single-node) |
| `@ensemble-sheets/storage-s3` | AWS S3 blob storage adapter |
| `@ensemble-sheets/webhook` | Outbound webhook event adapter |
| `@ensemble-sheets/demo` | Demo app: single-tenant dev server + Vite front-end |

## Documentation

- Full design spec: [`docs/specs/2026-05-15-ensemble-design.md`](./docs/specs/2026-05-15-ensemble-design.md)
- Sprint 1 implementation plan: [`docs/superpowers/plans/2026-05-15-sprint1-it-opens.md`](./docs/superpowers/plans/2026-05-15-sprint1-it-opens.md)

## License

Apache 2.0 — see [LICENSE](./LICENSE).
