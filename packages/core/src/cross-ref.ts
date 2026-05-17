/**
 * Cross-sheet + cross-workbook reference parser (C2.3).
 *
 * Recognises Excel-style references:
 *   - "A1" / "A1:B10"
 *   - "Sheet1!A1" / "Sheet1!A1:C10"
 *   - "'Sheet With Space'!A1"
 *   - "[Workbook2]Sheet1!A1"
 *   - "[Workbook2]'Q1 2026'!A:A"
 */

export interface CrossRef {
  workbookName?: string
  sheetName?: string
  rangeRef: string
  isRelative: boolean
}

function unquote(s: string): string {
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'")
  }
  return s
}

const NAME_PART = String.raw`'(?:[^']|'')+'|[A-Za-z_][A-Za-z0-9_]*`
const REF_RE = new RegExp(
  String.raw`^(?:\[(?<wb>[^\]]+)\])?(?:(?<sheet>${NAME_PART})!)?(?<range>.+)$`,
)

const RANGE_RE = /^[A-Z]+\d*(?::[A-Z]+\d*)?$|^\d+(?::\d+)?$|^[A-Z]+:[A-Z]+$/

export function parseCrossRef(input: string): CrossRef | null {
  const text = input.trim()
  if (text.length === 0) return null
  const m = REF_RE.exec(text)
  if (!m) return null
  const wb = m.groups?.wb
  const sheet = m.groups?.sheet
  const range = m.groups?.range
  if (!range) return null
  if (!RANGE_RE.test(range.toUpperCase())) return null
  return {
    ...(wb !== undefined ? { workbookName: unquote(wb) } : {}),
    ...(sheet !== undefined ? { sheetName: unquote(sheet) } : {}),
    rangeRef: range.toUpperCase(),
    isRelative: wb === undefined && sheet === undefined,
  }
}

export function formatCrossRef(ref: CrossRef): string {
  function quoteIfNeeded(name: string): string {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name
    return `'${name.replace(/'/g, "''")}'`
  }
  const wbPart = ref.workbookName ? `[${ref.workbookName}]` : ''
  const sheetPart = ref.sheetName ? `${quoteIfNeeded(ref.sheetName)}!` : ''
  return `${wbPart}${sheetPart}${ref.rangeRef}`
}

export function resolveCrossRef(
  ref: CrossRef,
  ctx: {
    currentWorkbookId: string
    currentSheetId: string
    workbooksByName: Map<string, string>
    sheetsByNameInCurrent: Map<string, string>
    sheetsByNameInWorkbook?: (workbookId: string) => Map<string, string>
  },
): { workbookId: string; sheetId: string; rangeRef: string } | null {
  let workbookId = ctx.currentWorkbookId
  if (ref.workbookName) {
    const mapped = ctx.workbooksByName.get(ref.workbookName)
    if (!mapped) return null
    workbookId = mapped
  }

  let sheetId = ctx.currentSheetId
  if (ref.sheetName) {
    const sheets =
      workbookId === ctx.currentWorkbookId
        ? ctx.sheetsByNameInCurrent
        : ctx.sheetsByNameInWorkbook?.(workbookId)
    if (!sheets) return null
    const lower = ref.sheetName.toLowerCase()
    let found: string | undefined
    for (const [name, id] of sheets) {
      if (name.toLowerCase() === lower) {
        found = id
        break
      }
    }
    if (!found) return null
    sheetId = found
  }

  return { workbookId, sheetId, rangeRef: ref.rangeRef }
}
