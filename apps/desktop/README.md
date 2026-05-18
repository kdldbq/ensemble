# @ensemble-sheets/desktop

Tauri 2 wrapper that ships the demo as a native macOS / Windows / Linux app.

The demo's Vite dev server (`pnpm --filter @ensemble-sheets/demo dev`) is
launched automatically when you run `pnpm dev` here.

## Prerequisites

- Rust (`rustup` + stable toolchain)
- `pnpm i` at the repo root

## Develop

```bash
pnpm --filter @ensemble-sheets/desktop dev
```

## Build

```bash
pnpm --filter @ensemble-sheets/desktop build
```

Produces native bundles under `src-tauri/target/release/bundle/`.

## Status

J1 scaffold — boots the demo URL only. No native menus, no auto-update,
no signing. Wire those in once distribution requirements are clear.
