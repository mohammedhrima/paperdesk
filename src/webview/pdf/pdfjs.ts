import { GlobalWorkerOptions, getDocument, PixelsPerInch, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PdfViewerOptions } from '../protocol';

/**
 * CSS pixels per PDF point. Multiplying by this makes "100%" mean the page's
 * true physical size on screen, matching every other PDF reader.
 */
export const CSS_UNITS = PixelsPerInch.PDF_TO_CSS_UNITS;

let workerReady: Promise<void> | undefined;

/**
 * Starts the pdf.js worker from a same-origin blob.
 *
 * Browsers only allow workers from the document's own origin. A webview's
 * document and its bundled files live on different origins — in production and
 * under the dev server alike — so the worker script is fetched and re-hosted as
 * a blob, which is always same-origin.
 */
function ensureWorker(): Promise<void> {
  workerReady ??= (async () => {
    const response = await fetch(workerUrl);
    if (!response.ok) throw new Error(`Could not load the PDF engine (${response.status}).`);
    const blob = new Blob([await response.text()], { type: 'text/javascript' });
    GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob), { type: 'module' });
  })();
  return workerReady;
}

export async function openDocument(data: Uint8Array, options: PdfViewerOptions): Promise<PDFDocumentProxy> {
  await ensureWorker();
  return getDocument({
    data,
    cMapUrl: options.cMapUrl,
    cMapPacked: true,
    standardFontDataUrl: options.standardFontDataUrl,
    // The webview's CSP forbids eval; saying so up front avoids a noisy probe.
    isEvalSupported: false,
  }).promise;
}
