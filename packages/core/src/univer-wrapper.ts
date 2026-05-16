/**
 * Univer wrapper — createEditor factory
 *
 * Implementation notes (Univer 0.22.1 vs plan 0.5.0 deviations):
 *
 * 1. `Univer.getSnapshot(id)` does NOT exist in 0.22.1.
 *    The correct path is:
 *      univer.__getInjector().get(IUniverInstanceService).getUniverSheetInstance(id).getSnapshot()
 *
 * 2. `UniverInstanceType.UNIVER_SHEET` exists and is correct (value = 2).
 *    No name change needed.
 *
 * 3. UI plugins (@univerjs/ui, @univerjs/sheets-ui, @univerjs/sheets-formula) depend
 *    on @univerjs/icons which is NOT installed in this package for Node/jsdom tests.
 *    They are loaded via `loadBrowserPlugins(univer, container)` (async, dynamic import)
 *    which is called by mountWorkbookEditor in a browser context before editor.load().
 *    Errors are swallowed so Node/jsdom unit tests continue to work headlessly.
 *
 * 4. `defaultTheme` from @univerjs/design also transitively requires @univerjs/icons.
 *    We pass `theme: undefined` when the import fails (graceful degradation).
 *
 * 5. `Univer` constructor `locale` param accepts a string like `'enUS'` (LocaleType enum
 *    value), not the enum key. `LocaleType.EN_US === 'enUS'` in 0.22.1.
 */

import {
  type ILocales,
  IUniverInstanceService,
  type IWorkbookData,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core'
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import type { UniverWorkbookData } from './types'

export interface EditorOpts {
  container: HTMLElement
  locale?: LocaleType
  /** Pre-loaded Univer locale resources. Use loadBrowserLocales() to fetch them. */
  locales?: ILocales
}

export interface Editor {
  load(data: UniverWorkbookData): void
  getData(): UniverWorkbookData
  destroy(): void
  /** @internal — used by mountWorkbookEditor to attach browser UI plugins before load() */
  _univer: Univer
}

/** Map our internal UniverWorkbookData → IWorkbookData for Univer's createUnit */
function toUniverWorkbook(data: UniverWorkbookData): IWorkbookData {
  const sheets: IWorkbookData['sheets'] = {}
  for (const id of data.sheetOrder) {
    const s = data.sheets[id]
    if (s) {
      sheets[id] = { id, name: s.name, cellData: s.cellData as never }
    }
  }
  return {
    id: data.id,
    name: '',
    sheetOrder: data.sheetOrder,
    sheets,
    styles: {},
    appVersion: '',
    locale: LocaleType.EN_US,
  }
}

/** Map IWorkbookData → our UniverWorkbookData */
function fromUniverWorkbook(snapshot: IWorkbookData): UniverWorkbookData {
  const sheets: UniverWorkbookData['sheets'] = {}
  for (const id of snapshot.sheetOrder) {
    const s = snapshot.sheets[id]
    if (s) {
      sheets[id] = {
        id,
        name: s.name ?? id,
        cellData: (s.cellData as never) ?? {},
      }
    }
  }
  return { id: snapshot.id, sheetOrder: snapshot.sheetOrder, sheets }
}

export function createEditor(opts: EditorOpts): Editor {
  const univer = new Univer({
    locale: opts.locale ?? LocaleType.EN_US,
    ...(opts.locales ? { locales: opts.locales } : {}),
  })

  // Always-safe plugins (no missing peer deps).
  // UniverDocsPlugin must be registered before UniverSheetsPlugin — sheets-ui's
  // FormatPainterMenuItemFactory pulls in EditorBridgeService which depends on
  // IEditorService (provided by docs core).
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverFormulaEnginePlugin)
  univer.registerPlugin(UniverDocsPlugin)
  univer.registerPlugin(UniverSheetsPlugin)

  const injector = univer.__getInjector()

  let currentId: string | null = null

  return {
    _univer: univer,

    load(data: UniverWorkbookData): void {
      currentId = data.id
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, toUniverWorkbook(data))
    },

    getData(): UniverWorkbookData {
      if (!currentId) throw new Error('ensemble: no workbook loaded — call load() first')
      // In 0.22.1, snapshot lives on the workbook instance, not on Univer directly.
      const svc = injector.get(IUniverInstanceService)
      const wb = svc.getUniverSheetInstance(currentId)
      if (!wb)
        throw new Error(`ensemble: workbook ${currentId} not found in Univer instance service`)
      const snap = wb.getSnapshot() as IWorkbookData
      return fromUniverWorkbook(snap)
    },

    destroy(): void {
      univer.dispose()
    },
  }
}

/**
 * Load Univer locale resources for the browser via dynamic import.
 *
 * These must be passed to the Univer constructor — registering them later via
 * plugin config has no effect on UI components like Ribbon that resolve
 * locale strings at first render. Call this BEFORE createEditor() and pass
 * the result into EditorOpts.locales.
 *
 * Failures are swallowed (returns undefined) so Node/jsdom tests still work.
 */
export async function loadBrowserLocales(): Promise<ILocales | undefined> {
  try {
    // Note: @univerjs/docs (core docs model) has no locale subpath — only docs-ui does.
    const [ui, docsUi, sheets, sheetsUi, sheetsFormula] = await Promise.all([
      import('@univerjs/ui/locale/en-US').then((m) => (m as { default: unknown }).default).catch(() => ({})),
      import('@univerjs/docs-ui/locale/en-US').then((m) => (m as { default: unknown }).default).catch(() => ({})),
      import('@univerjs/sheets/locale/en-US').then((m) => (m as { default: unknown }).default).catch(() => ({})),
      import('@univerjs/sheets-ui/locale/en-US').then((m) => (m as { default: unknown }).default).catch(() => ({})),
      import('@univerjs/sheets-formula/locale/en-US').then((m) => (m as { default: unknown }).default).catch(() => ({})),
    ])
    const merged = Object.assign({}, ui, docsUi, sheets, sheetsUi, sheetsFormula) as ILocales[LocaleType]
    return { [LocaleType.EN_US]: merged }
  } catch (err) {
    console.warn('ensemble: failed to load Univer locales (UI may be unlabeled)', err)
    return undefined
  }
}

/**
 * Load browser-only UI plugins via dynamic import (async).
 *
 * These modules transitively depend on @univerjs/icons which is not installed
 * for Node/jsdom unit tests. Dynamic import lets Vite tree-shake them properly
 * in the browser bundle and lets Node/jsdom silently skip them (errors are caught).
 *
 * Call this from a browser context (e.g. mountWorkbookEditor) BEFORE editor.load()
 * so the UI canvas is ready before workbook data is set.
 */
export async function loadBrowserPlugins(
  univer: Univer,
  container: HTMLElement,
  onError?: (plugin: string, error: unknown) => void,
): Promise<void> {
  const warn =
    onError ??
    ((plugin, err) => console.warn(`ensemble: failed to load browser plugin "${plugin}"`, err))

  try {
    const { UniverUIPlugin } = await import('@univerjs/ui')
    univer.registerPlugin(UniverUIPlugin as Parameters<typeof univer.registerPlugin>[0], {
      container,
    })
  } catch (err) {
    warn('@univerjs/ui', err)
  }

  try {
    const { UniverDocsUIPlugin } = await import('@univerjs/docs-ui')
    univer.registerPlugin(UniverDocsUIPlugin as Parameters<typeof univer.registerPlugin>[0])
  } catch (err) {
    warn('@univerjs/docs-ui', err)
  }

  try {
    const { UniverSheetsUIPlugin } = await import('@univerjs/sheets-ui')
    univer.registerPlugin(UniverSheetsUIPlugin as Parameters<typeof univer.registerPlugin>[0])
  } catch (err) {
    warn('@univerjs/sheets-ui', err)
  }

  try {
    const { UniverSheetsFormulaPlugin } = await import('@univerjs/sheets-formula')
    univer.registerPlugin(UniverSheetsFormulaPlugin as Parameters<typeof univer.registerPlugin>[0])
  } catch (err) {
    warn('@univerjs/sheets-formula', err)
  }
}
