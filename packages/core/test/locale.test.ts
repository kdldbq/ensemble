import { LocaleType } from '@univerjs/core'
import { describe, expect, it } from 'vitest'
import { loadBrowserLocales } from '../src/univer-wrapper'

describe('loadBrowserLocales', () => {
  it('returns Univer locale resources keyed by ZH_CN by default', async () => {
    const locales = await loadBrowserLocales()
    expect(locales).toBeDefined()
    // Default flip: SDK must hand Univer the zh-CN dictionary so the toolbar,
    // formula bar, right-click menus, and number-format dialogs render in
    // Simplified Chinese without the host having to opt in.
    expect(locales).toHaveProperty(LocaleType.ZH_CN)
    expect(locales).not.toHaveProperty(LocaleType.EN_US)
  })

  it('merged dict is non-empty (sanity: each plugin contributed some keys)', async () => {
    const locales = await loadBrowserLocales()
    const dict = locales?.[LocaleType.ZH_CN]
    expect(dict).toBeDefined()
    expect(Object.keys(dict ?? {}).length).toBeGreaterThan(0)
  })

  it('includes locale strings for every registered plugin (one canary key each)', async () => {
    const locales = await loadBrowserLocales()
    const dict = (locales?.[LocaleType.ZH_CN] ?? {}) as Record<string, unknown>
    // Walk a dotted path; returns undefined if any segment is missing.
    function getPath(obj: Record<string, unknown>, path: string): unknown {
      return path.split('.').reduce<unknown>((acc, seg) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[seg]
        return undefined
      }, obj)
    }
    // Each canary lives in a different plugin's locale bundle. If a plugin's
    // zh-CN file isn't merged into loadBrowserLocales(), Univer falls back to
    // rendering the raw dotted key in the UI (see the screenshot bug where the
    // conditional-formatting dropdown read "sheet.cf.ruleType.highlightCell"
    // verbatim because that plugin's locale wasn't loaded).
    const canaries: ReadonlyArray<[string, string]> = [
      ['sheet.cf.ruleType.highlightCell', 'sheets-conditional-formatting-ui'],
      ['sheet.numfmt.title', 'sheets-numfmt-ui'],
      ['sheets-filter.toolbar.smart-toggle-filter-tooltip', 'sheets-filter-ui'],
      ['sheets-sort.general.sort', 'sheets-sort-ui'],
      ['find-replace.dialog.find-placeholder', 'find-replace'],
      ['dataValidation.title', 'sheets-data-validation-ui'],
    ]
    const missing: string[] = []
    for (const [path, plugin] of canaries) {
      if (getPath(dict, path) == null) missing.push(`${plugin} (key=${path})`)
    }
    expect(missing).toEqual([])
  })
})
