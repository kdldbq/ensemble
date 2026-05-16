/**
 * Univer wrapper — createEditor factory + plugin orchestration.
 *
 * Implementation notes (Univer 0.22.1):
 *
 * 1. Univer 0.22 has a STRICT plugin lifecycle. Plugins must be registered in the
 *    order documented in the official quickstart:
 *      RenderEngine → FormulaEngine → UI → Docs → DocsUI → Sheets → SheetsUI → SheetsFormula
 *    Then createUnit(UNIVER_SHEET, ...) triggers init.
 *    Registering them in any other order (or splitting sync/async across phases)
 *    can leave the cell-editor doc unit uncreated — selection works but typing
 *    silently no-ops.
 *
 * 2. UI plugins transitively import @univerjs/icons. We accept that — icons IS
 *    installed in packages/core. There is no Node/jsdom-vs-browser split here:
 *    real tests use _editorFactory to bypass createEditor entirely.
 *
 * 3. `Univer.getSnapshot(id)` does NOT exist in 0.22.1; snapshots live on the
 *    workbook instance reached via IUniverInstanceService.getUniverSheetInstance.
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
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverUIPlugin } from '@univerjs/ui'
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
  /** @internal — exposed for advanced consumers (e2e helpers, etc.) */
  _univer: Univer
}

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

  // Register ALL plugins synchronously in the official Univer 0.22 order BEFORE
  // any createUnit fires. This is the only order that gives the cell-editor doc
  // unit a chance to bootstrap properly — splitting sync vs async, or reordering
  // any of these, leaves you with a renderable grid that won't accept typing.
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverFormulaEnginePlugin)
  univer.registerPlugin(UniverUIPlugin, { container: opts.container })
  univer.registerPlugin(UniverDocsPlugin)
  univer.registerPlugin(UniverDocsUIPlugin)
  univer.registerPlugin(UniverSheetsPlugin)
  univer.registerPlugin(UniverSheetsUIPlugin)
  univer.registerPlugin(UniverSheetsFormulaPlugin)
  // Critical: in Univer 0.22 the FormulaEditor React component (the actual <input>
  // that appears when you type in a cell) lives in @univerjs/sheets-formula-ui, split
  // out from sheets-formula. Without this plugin, sheets-ui's EditorContainer renders
  // an empty div over the cell, selection works but keystrokes silently no-op.
  univer.registerPlugin(UniverSheetsFormulaUIPlugin)

  const injector = univer.__getInjector()

  let currentId: string | null = null

  return {
    _univer: univer,

    load(data: UniverWorkbookData): void {
      currentId = data.id
      univer.createUnit(UniverInstanceType.UNIVER_SHEET, toUniverWorkbook(data))
      // Belt-and-suspenders: ensure the new sheet is the focused unit even if the
      // sheets-ui auto-focus race didn't catch the createUnit emission.
      try {
        const svc = injector.get(IUniverInstanceService)
        const focusUnit = (svc as unknown as { focusUnit?: (id: string) => void }).focusUnit
        focusUnit?.call(svc, data.id)
      } catch {
        /* non-critical */
      }
    },

    getData(): UniverWorkbookData {
      if (!currentId) throw new Error('ensemble: no workbook loaded — call load() first')
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
 * Must be passed to the Univer constructor — registering them later via plugin
 * config has no effect on UI components like Ribbon that resolve locale strings
 * at first render. Call this BEFORE createEditor() and pass the result via
 * EditorOpts.locales.
 *
 * Failures are swallowed (returns undefined) so Node/jsdom tests still work.
 */
export async function loadBrowserLocales(): Promise<ILocales | undefined> {
  try {
    const [ui, docsUi, sheets, sheetsUi, sheetsFormula] = await Promise.all([
      import('@univerjs/ui/locale/en-US')
        .then((m) => (m as { default: unknown }).default)
        .catch(() => ({})),
      import('@univerjs/docs-ui/locale/en-US')
        .then((m) => (m as { default: unknown }).default)
        .catch(() => ({})),
      import('@univerjs/sheets/locale/en-US')
        .then((m) => (m as { default: unknown }).default)
        .catch(() => ({})),
      import('@univerjs/sheets-ui/locale/en-US')
        .then((m) => (m as { default: unknown }).default)
        .catch(() => ({})),
      import('@univerjs/sheets-formula/locale/en-US')
        .then((m) => (m as { default: unknown }).default)
        .catch(() => ({})),
    ])
    const merged = Object.assign(
      {},
      ui,
      docsUi,
      sheets,
      sheetsUi,
      sheetsFormula,
    ) as ILocales[LocaleType]
    return { [LocaleType.EN_US]: merged }
  } catch (err) {
    console.warn('ensemble: failed to load Univer locales (UI may be unlabeled)', err)
    return undefined
  }
}

/**
 * Backwards-compat shim. Previously this function loaded UI plugins asynchronously;
 * we now register them synchronously inside createEditor() so the cell-editor
 * pipeline works. This function is a no-op kept for API stability — existing callers
 * (mount.ts, e2e helpers) can keep awaiting it.
 */
export async function loadBrowserPlugins(_univer: Univer, _container: HTMLElement): Promise<void> {
  // Intentionally empty: createEditor now registers all plugins eagerly.
}
