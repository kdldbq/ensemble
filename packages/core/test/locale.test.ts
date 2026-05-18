import { LocaleType } from '@univerjs/core'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadBrowserLocales } from '../src/univer-wrapper'

describe('loadBrowserLocales', () => {
  let locales: Awaited<ReturnType<typeof loadBrowserLocales>>
  beforeAll(async () => {
    locales = await loadBrowserLocales()
  })

  it('returns Univer locale resources keyed by ZH_CN by default', () => {
    // Default flip: SDK must hand Univer the zh-CN dictionary so the toolbar,
    // formula bar, right-click menus, and number-format dialogs render in
    // Simplified Chinese without the host having to opt in.
    expect(locales).toBeDefined()
    expect(locales).toHaveProperty(LocaleType.ZH_CN)
    expect(locales).not.toHaveProperty(LocaleType.EN_US)
  })

  it('merged dict is non-empty', () => {
    const dict = locales?.[LocaleType.ZH_CN]
    expect(dict).toBeDefined()
    expect(Object.keys(dict ?? {}).length).toBeGreaterThan(0)
  })

  it('resolves canary key paths for high-traffic UI plugins', () => {
    const dict = (locales?.[LocaleType.ZH_CN] ?? {}) as Record<string, unknown>
    function getPath(obj: Record<string, unknown>, path: string): unknown {
      return path.split('.').reduce<unknown>((acc, seg) => {
        if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[seg]
        return undefined
      }, obj)
    }
    // If a plugin's zh-CN bundle isn't merged into loadBrowserLocales(), Univer
    // renders the raw dotted key in the UI (the original screenshot bug had
    // dropdowns reading "sheet.cf.ruleType.highlightCell" verbatim). Six
    // canaries cover the dropdowns / dialogs users hit most; the remaining
    // ~13 registered plugins (engine, design tokens, drawing shells, etc.)
    // are exercised transitively by e2e — adding canaries for all 19 would
    // slow this unit test without changing what it can catch.
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
