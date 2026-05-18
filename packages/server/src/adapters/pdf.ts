/**
 * Optional PDF renderer adapter (9.5). Host wires Puppeteer / Playwright /
 * Chromium-headless. Server-default falls back to printable HTML.
 */

export interface PdfRenderInput {
  html: string
  title: string
}

export interface PdfRendererAdapter {
  render(input: PdfRenderInput): Promise<Uint8Array>
}
