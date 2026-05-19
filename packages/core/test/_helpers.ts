import { vi } from 'vitest'

/**
 * Minimal Editor stub for mount.test.ts and mount-single-user.test.ts.
 * Records every `load()` call in `_loaded` and exposes a vitest spy on
 * `destroy()`. Filename starts with `_` so vitest's default test glob
 * skips it.
 */
export function makeFakeEditor() {
  const loaded: unknown[] = []
  return {
    load: (d: unknown) => loaded.push(d),
    getData: () => ({
      id: 'w',
      sheetOrder: ['s'],
      sheets: { s: { id: 's', name: 'S', cellData: {} } },
    }),
    destroy: vi.fn(),
    _loaded: loaded,
  }
}
