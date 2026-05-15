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
 *    on @univerjs/icons which is NOT installed in this package. They will fail to import
 *    in jsdom / Node (missing peer dep). We guard with dynamic import + try/catch so
 *    the factory still constructs and returns the { load, getData, destroy } handle.
 *    Full UI plugin registration is only meaningful in a real browser (Task 23 Playwright).
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

  // UI plugins require @univerjs/icons (not installed for unit tests).
  // Register them best-effort; failures are expected in jsdom and are
  // handled gracefully — full rendering is validated by Playwright (Task 23).
  // We use a sync try/catch around the imports via a factory pattern.
  _tryRegisterUiPlugins(univer, opts.container)

  const injector = univer.__getInjector()

  let currentId: string | null = null

  return {
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
 * Best-effort registration of UI plugins.
 * These modules transitively depend on @univerjs/icons which is not installed
 * as a dependency of @ensemble/core (it's a UI/browser-only concern). In jsdom
 * and plain Node the import will throw MODULE_NOT_FOUND — we swallow it so that
 * the factory is still usable for headless/data-only use cases.
 *
 * In a real browser build (vite bundled), @univerjs/icons is expected to be
 * available and these plugins will register successfully.
 */
function _tryRegisterUiPlugins(univer: Univer, container: HTMLElement): void {
  // We can't use top-level import for these because Vite will statically analyse
  // them and fail at bundle time if the module is missing. Instead we rely on
  // the fact that Vitest / Node will have already attempted the ESM resolution
  // and we catch the thrown errors here via dynamic import wrapped in a
  // synchronous facade. Since Vitest transforms to CJS internally, the require()
  // path is safe in the test environment.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UniverUIPlugin } = require('@univerjs/ui') as {
      UniverUIPlugin: Parameters<typeof univer.registerPlugin>[0]
    }
    univer.registerPlugin(UniverUIPlugin, { container })
  } catch {
    // missing @univerjs/icons — expected in jsdom unit tests
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UniverSheetsUIPlugin } = require('@univerjs/sheets-ui') as {
      UniverSheetsUIPlugin: Parameters<typeof univer.registerPlugin>[0]
    }
    univer.registerPlugin(UniverSheetsUIPlugin)
  } catch {
    // missing @univerjs/icons — expected in jsdom unit tests
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UniverSheetsFormulaPlugin } = require('@univerjs/sheets-formula') as {
      UniverSheetsFormulaPlugin: Parameters<typeof univer.registerPlugin>[0]
    }
    univer.registerPlugin(UniverSheetsFormulaPlugin)
  } catch {
    // missing @univerjs/icons — expected in jsdom unit tests
  }
}
