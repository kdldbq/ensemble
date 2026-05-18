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
})
