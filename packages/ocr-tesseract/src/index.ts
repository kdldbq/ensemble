/**
 * Tesseract.js OCR adapter (C2.5).
 *
 * Reference implementation of OcrAdapter. Splits Tesseract's text output on
 * whitespace into a grid: newlines become rows, runs of 2+ spaces or tabs
 * become column boundaries. For complex tabular images, swap in a commercial
 * provider via the OcrAdapter contract.
 */

import type { OcrAdapter, OcrInput, OcrTable } from '@ensemble-sheets/server'

export interface TesseractOcrAdapterOpts {
  /** Language codes Tesseract should load. Default: ['eng', 'chi_sim']. */
  langs?: string[]
  /** tessedit_pageseg_mode (page segmentation). Default: 6 (single block). */
  psm?: number
}

export class TesseractOcrAdapter implements OcrAdapter {
  constructor(private readonly opts: TesseractOcrAdapterOpts = {}) {}

  async extract(input: OcrInput): Promise<OcrTable> {
    // tesseract.js ships permissive types and changes its export shape across
    // major versions; we pin against the duck-typed `.recognize(buffer, lang, opts)`
    // entry point and `.data.text / .data.confidence` result. If tesseract.js
    // breaks one of these, replace the access with a typed import + bump the
    // peerDependency range.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tess: any = await import('tesseract.js').catch(() => null)
    if (!tess) {
      throw new Error('tesseract.js not installed — add it as a peer dep')
    }
    const lang = (this.opts.langs ?? ['eng', 'chi_sim']).join('+')
    const buffer = Buffer.from(input.bytes)
    const { data } = await tess.recognize(buffer, lang, {})
    const text: string = data?.text ?? ''
    const grid = splitToGrid(text)
    const cells = grid.flatMap((row, r) =>
      row.map((cell, c) => ({
        row: r,
        col: c,
        text: cell,
        confidence: data?.confidence ? data.confidence / 100 : null,
      })),
    )
    const cols = grid.reduce((m, row) => Math.max(m, row.length), 0)
    const warning =
      input.mode === 'table' && cols < 2
        ? 'mode=table but only one column detected — image may not be tabular'
        : null
    return {
      cells,
      rows: grid.length,
      cols,
      ...(warning ? { warning } : {}),
    }
  }
}

export function splitToGrid(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0)
  return lines.map((line) => {
    const parts = line.split(/(?:\t| {2,})/).map((s) => s.trim())
    return parts.length > 0 ? parts : [line.trim()]
  })
}
