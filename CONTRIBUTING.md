# Contributing to ensemble

ensemble is an open-source collaborative spreadsheet platform. It embeds a Univer-powered editor into host applications, with host-pluggable auth, permission, data-masking, and storage adapters.

## Prerequisites

- Node 20+
- pnpm 9 (`npm install -g pnpm@9`)
- Docker (used by integration tests via Testcontainers)

## Setup

```bash
pnpm install
```

## Running tests

```bash
pnpm -r test
```

Unit and integration tests live in `packages/*/test/`. The integration suite spins up a Postgres container automatically via Testcontainers — no manual DB setup required.

## Linting

```bash
pnpm lint          # check
pnpm lint:fix      # auto-fix
```

Style is enforced by [Biome](https://biomejs.dev). CI will reject lint failures.

## Test-Driven Development

New features should be written test-first. Place tests in the relevant `packages/<name>/test/` directory alongside source files. All tests must pass before opening a PR.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(server): add JWKS identity adapter
fix(core): handle empty sheet on init
chore: update dependencies
```

## Opening a pull request

1. Fork the repo and create a feature branch.
2. Run `pnpm -r test` and `pnpm lint` — both must be green.
3. Open a PR against `main` with a clear description of what and why.

## License

By submitting a contribution you agree that your code will be licensed under the [Apache License 2.0](./LICENSE).
