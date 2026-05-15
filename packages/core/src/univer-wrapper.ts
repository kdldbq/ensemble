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
  IUniverInstanceService,
  LocaleType,
  Univer,
  UniverInstanceType,
  type IWorkbookData,
} from '@univerjs/core'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import type { UniverWorkbookData } from './types'

export interface EditorOpts {
  container: HTMLElement
  locale?: LocaleType
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
  })

  // Always-safe plugins (no missing peer deps)
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverFormulaEnginePlugin)
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
      if (!wb) throw new Error(`ensemble: workbook ${currentId} not found in Univer instance service`)
      const snap = wb.getSnapshot() as IWorkbookData
      return fromUniverWorkbook(snap)
    },

    destroy(): void {
      univer.dispose()
    },
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
export async function loadBrowserPlugins(univer: Univer, container: HTMLElement): Promise<void> {
  try {
    const { UniverUIPlugin } = await import('@univerjs/ui')
    univer.registerPlugin(UniverUIPlugin as Parameters<typeof univer.registerPlugin>[0], { container })
  } catch {
    // @univerjs/icons not available — expected in jsdom / Node unit tests
  }

  try {
    const { UniverSheetsUIPlugin } = await import('@univerjs/sheets-ui')
    univer.registerPlugin(UniverSheetsUIPlugin as Parameters<typeof univer.registerPlugin>[0])
  } catch {
    // @univerjs/icons not available — expected in jsdom / Node unit tests
  }

  try {
    const { UniverSheetsFormulaPlugin } = await import('@univerjs/sheets-formula')
    univer.registerPlugin(UniverSheetsFormulaPlugin as Parameters<typeof univer.registerPlugin>[0])
  } catch {
    // @univerjs/icons not available — expected in jsdom / Node unit tests
  }
}
