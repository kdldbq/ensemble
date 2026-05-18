#!/usr/bin/env node
/**
 * Bundle size budget check (I9).
 *
 * Walks packages/<pkg>/dist and asserts the gzipped size of each entry
 * stays below its budget. Run as part of CI after `pnpm -r build`.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGETS = {
  'packages/core/dist/mount.js': 50_000,
  'packages/core/dist/api-client.js': 12_000,
  'packages/core/dist/index.js': 5_000,
  'packages/react/dist/FolderTree.js': 12_000,
  'packages/react/dist/WorkbookEditor.js': 5_000,
  'packages/react/dist/ActivityTimeline.js': 6_000,
  'packages/react/dist/index.js': 3_000,
  'packages/server/dist/index.js': 6_000,
  'packages/server/dist/server.js': 12_000,
  'packages/server/dist/http/app.js': 8_000,
  'packages/webhook/dist/index.js': 4_000,
  'packages/mcp-server/dist/index.js': 6_000,
  'packages/scim-adapter/dist/index.js': 4_000,
}

const ROOT = process.cwd()
const failures = []
const checks = []

function gzipSize(path) {
  const raw = readFileSync(path)
  return gzipSync(raw).length
}

for (const [rel, budget] of Object.entries(BUDGETS)) {
  const abs = join(ROOT, rel)
  if (!existsSync(abs)) {
    console.warn(`SKIP  ${rel} (not built yet — run pnpm -r build first)`)
    continue
  }
  const size = gzipSize(abs)
  const ok = size <= budget
  checks.push({ rel, size, budget, ok })
  if (!ok) failures.push({ rel, size, budget })
}

const longest = checks.reduce((m, c) => Math.max(m, c.rel.length), 0)

console.log('\nBundle budget check (gzipped):\n')
for (const c of checks) {
  const status = c.ok ? '✓' : '✗'
  const pct = ((c.size / c.budget) * 100).toFixed(1)
  console.log(
    `  ${status} ${c.rel.padEnd(longest)}  ${(c.size / 1024).toFixed(1)} KB / ${(c.budget / 1024).toFixed(1)} KB  (${pct}%)`,
  )
}

if (failures.length > 0) {
  console.error(
    `\n✗ ${failures.length} file(s) exceed budget. Bump intentionally in scripts/check-bundle-size.mjs if justified, or trim the bundle.\n`,
  )
  process.exit(1)
} else {
  console.log(`\n✓ All ${checks.length} budgets within limit.\n`)
}
