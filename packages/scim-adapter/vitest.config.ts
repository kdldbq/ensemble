import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // No tests shipped yet — the package is a typed protocol helper for hosts.
    // Without this flag, vitest auto-discovers ../../vitest.workspace.ts and
    // tries to resolve sibling packages relative to this package's cwd, which
    // fabricates broken paths like packages/scim-adapter/packages/core.
    passWithNoTests: true,
  },
})
