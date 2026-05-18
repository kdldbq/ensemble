import type { WorkbookData } from './mask-service'

/**
 * Render a Univer snapshot to printable HTML. Conservative typography
 * (sans + 11px) + `@page` rules so the browser-side Save-as-PDF path produces
 * tidy multi-sheet tables. Honors the masked cell shape (where applicable).
 */
export function renderWorkbookHtml(data: WorkbookData, title: string): string {
  const sheets = data.sheets ?? {}
  const sheetIds = data.sheetOrder ?? Object.keys(sheets)
  const body = sheetIds
    .map((sid) => {
      const s = sheets[sid] as
        | { name?: string; cellData?: Record<string, Record<string, { v?: unknown }>> }
        | undefined
      if (!s) return ''
      const cellData = s.cellData ?? {}
      const rows = Object.keys(cellData)
        .map(Number)
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)
      const colSet = new Set<number>()
      for (const r of rows) {
        for (const k of Object.keys(cellData[String(r)] ?? {})) {
          const n = Number(k)
          if (Number.isFinite(n)) colSet.add(n)
        }
      }
      const cols = [...colSet].sort((a, b) => a - b)
      const trs = rows
        .map((r) => {
          const cells = cols.map((c) => {
            const v = cellData[String(r)]?.[String(c)]?.v
            return `<td>${escapeHtml(v ?? '')}</td>`
          })
          return `<tr>${cells.join('')}</tr>`
        })
        .join('')
      return `<section><h2>${escapeHtml(s.name ?? sid)}</h2><table>${trs}</table></section>`
    })
    .join('')

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font: 11px / 1.4 -apple-system, "Helvetica Neue", "Microsoft YaHei", sans-serif; color: #111; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  section { break-inside: avoid; margin-bottom: 16px; }
  h2 { font-size: 13px; margin: 8px 0 4px; color: #2563eb; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #d1d5db; padding: 3px 6px; vertical-align: top; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`
}

function escapeHtml(s: unknown): string {
  const str = String(s ?? '')
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
