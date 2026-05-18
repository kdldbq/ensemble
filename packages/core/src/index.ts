// biome-ignore-all lint/style/noNonNullAssertion: array accesses are guarded by length checks that Biome cannot statically prove.
export { ApiClient, type ApiClientOpts } from './api-client'
export {
  buildChartData,
  type ChartData,
  type ChartKind,
  type ChartSeries,
  type ChartSpec,
  type FreezeConfig,
} from './chart'
export {
  type CrossRef,
  formatCrossRef,
  parseCrossRef,
  resolveCrossRef,
} from './cross-ref'
export {
  type CollabCapability,
  type MountHandle,
  type MountOpts,
  mountWorkbookEditor,
} from './mount'
export {
  createOfflineCache,
  type OfflineCache,
  type OfflineCacheOpts,
  type QueuedMutation,
} from './offline-cache'
export {
  computePivot,
  type PivotAgg,
  type PivotResult,
  type PivotSpec,
} from './pivot'
export { runScript, type ScriptContext, type ScriptResult } from './scripts'
export { detectFillPattern, extendFill, type FillPattern } from './smart-fill'
export * from './types'
export {
  createEditor,
  type Editor,
  type EditorOpts,
  loadBrowserLocales,
  loadBrowserPlugins,
} from './univer-wrapper'
export {
  type ConnectionState,
  type NotificationFrame,
  type PresenceEntry,
  type WelcomeFrame,
  WsClient,
} from './ws-client'
export { univerJsonToXlsx, xlsxToUniverJson } from './xlsx-converter'
