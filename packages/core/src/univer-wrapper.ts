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
  ICommandService,
  type ILocales,
  IUniverInstanceService,
  type IWorkbookData,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core'

// `ICommandService` is dual-purpose in Univer 0.22: the imported value is the
// DI identifier (used by `injector.get(...)`), and the same name as a type is
// the service-interface shape. We alias the type so callers reading `Editor`
// see a well-named interface and don't accidentally trip on the value/type
// collision at the call site.
type ICommandServiceType = import('@univerjs/core').ICommandService
import { UniverDocsPlugin } from '@univerjs/docs'
import { UniverDocsDrawingPlugin } from '@univerjs/docs-drawing'
import { UniverDocsDrawingUIPlugin } from '@univerjs/docs-drawing-ui'
import { UniverDocsUIPlugin } from '@univerjs/docs-ui'
import { UniverDrawingPlugin } from '@univerjs/drawing'
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula'
import { UniverRenderEnginePlugin } from '@univerjs/engine-render'
import { UniverFindReplacePlugin } from '@univerjs/find-replace'
import { UniverSheetsPlugin } from '@univerjs/sheets'
import { UniverSheetsConditionalFormattingPlugin } from '@univerjs/sheets-conditional-formatting'
import { UniverSheetsConditionalFormattingUIPlugin } from '@univerjs/sheets-conditional-formatting-ui'
import { UniverSheetsDataValidationPlugin } from '@univerjs/sheets-data-validation'
import { UniverSheetsDataValidationUIPlugin } from '@univerjs/sheets-data-validation-ui'
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing'
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui'
import { UniverSheetsFilterPlugin } from '@univerjs/sheets-filter'
import { UniverSheetsFilterUIPlugin } from '@univerjs/sheets-filter-ui'
import { UniverSheetsFindReplacePlugin } from '@univerjs/sheets-find-replace'
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula'
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui'
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt'
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui'
import { UniverSheetsSortPlugin } from '@univerjs/sheets-sort'
import { UniverSheetsSortUIPlugin } from '@univerjs/sheets-sort-ui'
import { UniverSheetsThreadCommentPlugin } from '@univerjs/sheets-thread-comment'
import { UniverSheetsThreadCommentUIPlugin } from '@univerjs/sheets-thread-comment-ui'
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui'
import { UniverThreadCommentPlugin } from '@univerjs/thread-comment'
import { UniverThreadCommentUIPlugin } from '@univerjs/thread-comment-ui'
import { UniverUIPlugin } from '@univerjs/ui'
import type { UniverWorkbookData } from './types'

export interface EditorOpts {
  container: HTMLElement
  locale?: LocaleType
  /** Pre-loaded Univer locale resources. Use loadBrowserLocales() to fetch them. */
  locales?: ILocales
  /**
   * When true, Univer is bootstrapped in viewer mode and toolbar commands that
   * mutate the document (set value, merge cells, change borders, etc.) are
   * intercepted before reaching the mutation pipeline.
   */
  readOnly?: boolean
}

export interface Editor {
  load(data: UniverWorkbookData): void
  getData(): UniverWorkbookData
  destroy(): void
  /**
   * The Univer command service. Subscribe via `onCommandExecuted` to capture local
   * mutations for collaborative sync; invoke remote mutations via `executeCommand`
   * with `{ fromCollab: true }` so the listener skips them and no echo loop forms.
   */
  commandService: ICommandServiceType
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
    locale: LocaleType.ZH_CN,
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
    locale: opts.locale ?? LocaleType.ZH_CN,
    ...(opts.locales ? { locales: opts.locales } : {}),
  })

  // Register ALL plugins synchronously in the official Univer 0.22 order BEFORE
  // any createUnit fires. This is the only order that gives the cell-editor doc
  // unit a chance to bootstrap properly — splitting sync vs async, or reordering
  // any of these, leaves you with a renderable grid that won't accept typing.
  // Engines first
  univer.registerPlugin(UniverRenderEnginePlugin)
  univer.registerPlugin(UniverFormulaEnginePlugin)
  // UI shell
  univer.registerPlugin(UniverUIPlugin, { container: opts.container })
  // Drawing base (must come before docs/sheets drawing)
  univer.registerPlugin(UniverDrawingPlugin)
  // Docs stack
  univer.registerPlugin(UniverDocsPlugin)
  univer.registerPlugin(UniverDocsUIPlugin)
  univer.registerPlugin(UniverDocsDrawingPlugin)
  univer.registerPlugin(UniverDocsDrawingUIPlugin)
  // Sheets core
  univer.registerPlugin(UniverSheetsPlugin)
  univer.registerPlugin(UniverSheetsUIPlugin)
  // Number formatting (currency, %, date)
  univer.registerPlugin(UniverSheetsNumfmtPlugin)
  univer.registerPlugin(UniverSheetsNumfmtUIPlugin)
  // Formulas — sheets-formula-ui registers the FormulaEditor React component used
  // as the actual cell <input>. Without it, typing in cells silently no-ops.
  univer.registerPlugin(UniverSheetsFormulaPlugin)
  univer.registerPlugin(UniverSheetsFormulaUIPlugin)
  // Conditional formatting
  univer.registerPlugin(UniverSheetsConditionalFormattingPlugin)
  univer.registerPlugin(UniverSheetsConditionalFormattingUIPlugin)
  // Data validation (dropdowns, etc.)
  univer.registerPlugin(UniverSheetsDataValidationPlugin)
  univer.registerPlugin(UniverSheetsDataValidationUIPlugin)
  // Filters
  univer.registerPlugin(UniverSheetsFilterPlugin)
  univer.registerPlugin(UniverSheetsFilterUIPlugin)
  // Sort
  univer.registerPlugin(UniverSheetsSortPlugin)
  univer.registerPlugin(UniverSheetsSortUIPlugin)
  // Find & replace
  univer.registerPlugin(UniverFindReplacePlugin)
  univer.registerPlugin(UniverSheetsFindReplacePlugin)
  // Sheets drawing (images, shapes)
  univer.registerPlugin(UniverSheetsDrawingPlugin)
  univer.registerPlugin(UniverSheetsDrawingUIPlugin)
  // Comments (Google-Sheets-style threads)
  univer.registerPlugin(UniverThreadCommentPlugin)
  univer.registerPlugin(UniverThreadCommentUIPlugin)
  univer.registerPlugin(UniverSheetsThreadCommentPlugin)
  univer.registerPlugin(UniverSheetsThreadCommentUIPlugin)

  const injector = univer.__getInjector()
  const commandService = injector.get(ICommandService)

  let currentId: string | null = null

  return {
    _univer: univer,
    commandService,

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
/**
 * Deep-merge plain-object locale dicts in place. Univer plugins each contribute
 * to a few top-level keys, but several of them legitimately overlap — e.g.
 * sheets-numfmt-ui, sheets-conditional-formatting-ui, and sheets-ui all nest
 * strings under `sheet`. A shallow `Object.assign` would silently drop every
 * earlier `sheet.*` when a later plugin sets its own `sheet.*`, producing the
 * "raw key shown verbatim in the UI" failure mode (e.g. dropdowns reading
 * `sheet.cf.ruleType.highlightCell` instead of `突出显示单元格`).
 */
function deepMergeLocale(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sv = source[key]
    const tv = target[key]
    if (
      sv &&
      typeof sv === 'object' &&
      !Array.isArray(sv) &&
      tv &&
      typeof tv === 'object' &&
      !Array.isArray(tv)
    ) {
      deepMergeLocale(tv as Record<string, unknown>, sv as Record<string, unknown>)
    } else {
      target[key] = sv
    }
  }
  return target
}

export async function loadBrowserLocales(): Promise<ILocales | undefined> {
  // Each entry MUST be an inline `import()` with a string literal so bundlers
  // (vite / webpack) can statically resolve and code-split each chunk. Don't
  // refactor to `import(variable)` unless you also wire up `import.meta.glob`,
  // or the locale resources won't be shipped to the browser.
  //
  // Order matters only as a tie-breaker for primitive-vs-primitive collisions
  // (last write wins). For nested objects deepMergeLocale handles overlap, so
  // adding a plugin here is safe regardless of position.
  const loaders: Array<() => Promise<{ default: unknown }>> = [
    () => import('@univerjs/design/locale/zh-CN'),
    () => import('@univerjs/ui/locale/zh-CN'),
    () => import('@univerjs/docs-ui/locale/zh-CN'),
    () => import('@univerjs/docs-drawing-ui/locale/zh-CN'),
    () => import('@univerjs/sheets/locale/zh-CN'),
    () => import('@univerjs/sheets-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-formula/locale/zh-CN'),
    () => import('@univerjs/sheets-formula-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-numfmt-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-conditional-formatting-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-data-validation-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-filter-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-sort/locale/zh-CN'),
    () => import('@univerjs/sheets-sort-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-find-replace/locale/zh-CN'),
    () => import('@univerjs/sheets-drawing-ui/locale/zh-CN'),
    () => import('@univerjs/sheets-thread-comment-ui/locale/zh-CN'),
    () => import('@univerjs/find-replace/locale/zh-CN'),
    () => import('@univerjs/thread-comment-ui/locale/zh-CN'),
  ]
  try {
    const dicts = await Promise.all(
      loaders.map((load) =>
        load()
          .then((m) => (m.default ?? {}) as Record<string, unknown>)
          .catch(() => ({}) as Record<string, unknown>),
      ),
    )
    const merged: Record<string, unknown> = {}
    for (const d of dicts) deepMergeLocale(merged, d)
    return { [LocaleType.ZH_CN]: merged as ILocales[LocaleType] }
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
