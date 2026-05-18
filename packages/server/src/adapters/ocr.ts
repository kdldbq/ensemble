/**
 * OCR adapter (C2.5).
 *
 * Lets hosts wire image → cells flows. ensemble doesn't ship an OCR
 * engine — hosts plug in Tesseract, AWS Textract, Aliyun OCR, 腾讯 OCR,
 * or Claude/GPT vision.
 */

export interface OcrCell {
  row: number
  col: number
  text: string
  /** Optional 0..1 confidence; null when provider doesn't report. */
  confidence?: number | null
}

export interface OcrTable {
  cells: OcrCell[]
  rows: number
  cols: number
  warning?: string
}

export interface OcrInput {
  tenantId: string
  userId: string
  bytes: Uint8Array
  mimeType: string
  mode?: 'auto' | 'table' | 'text'
}

export interface OcrAdapter {
  extract(input: OcrInput): Promise<OcrTable>
}

export class NotImplementedOcrAdapter implements OcrAdapter {
  async extract(): Promise<OcrTable> {
    throw new Error('OcrAdapter not implemented — host must provide one via createServer.ocr')
  }
}
