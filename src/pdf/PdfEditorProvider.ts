import * as vscode from 'vscode';
import { onDidChangeConfig, pdfConfig } from '../config.js';
import type { ReadingState } from '../store/ReadingState.js';
import { buildWebviewHtml, webviewDistUri } from '../webview/html.js';
import type {
  PdfHostMessage,
  PdfViewerOptions,
  PdfWebviewMessage,
  ReadingPosition,
} from '../webview/protocol.js';

export const PDF_VIEW_TYPE = 'paperdesk.pdfViewer';

/** A read-only handle on the PDF being viewed. */
class PdfDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose(): void {
    /* Nothing is held open: bytes are handed to the webview and released. */
  }
}

/**
 * Opens PDFs in a webview-based reader.
 *
 * The document is read through `workspace.fs` and posted to the webview as
 * bytes rather than referenced by URL, so PDFs on remote or virtual file
 * systems open exactly like local ones.
 */
export class PdfEditorProvider implements vscode.CustomReadonlyEditorProvider<PdfDocument> {
  static register(context: vscode.ExtensionContext, readingState: ReadingState): vscode.Disposable {
    const provider = new PdfEditorProvider(context, readingState);
    return vscode.window.registerCustomEditorProvider(PDF_VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true },
      supportsMultipleEditorsPerDocument: false,
    });
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly readingState: ReadingState,
  ) {}

  openCustomDocument(uri: vscode.Uri): PdfDocument {
    return new PdfDocument(uri);
  }

  async resolveCustomEditor(
    document: PdfDocument,
    panel: vscode.WebviewPanel,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const { webview } = panel;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewDistUri(this.context.extensionUri)],
    };
    webview.html = buildWebviewHtml({
      webview,
      extensionUri: this.context.extensionUri,
      mode: this.context.extensionMode,
      entry: 'pdf',
      title: basename(document.uri),
    });

    const post = (message: PdfHostMessage): void => void webview.postMessage(message);

    // The most recent position the webview reported, saved when the tab closes
    // so a whole reading session costs one write instead of hundreds.
    let position = this.readingState.get(document.uri);

    const subscriptions = [
      webview.onDidReceiveMessage(async (message: PdfWebviewMessage) => {
        switch (message.type) {
          case 'pdf/ready': {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            if (token.isCancellationRequested) return;
            post({
              type: 'pdf/open',
              data: asPlainUint8Array(bytes),
              fileName: basename(document.uri),
              options: this.viewerOptions(webview),
              position,
            });
            break;
          }
          case 'pdf/position':
            position = message.position;
            break;
          case 'pdf/error':
            void vscode.window.showErrorMessage(`PaperDesk: ${message.message}`);
            break;
        }
      }),

      onDidChangeConfig(() => post({ type: 'pdf/options', options: this.viewerOptions(webview) })),

      // Following the editor's own theme is only meaningful while the user has
      // not pinned one, which `resolvePdfTheme` already accounts for.
      vscode.window.onDidChangeActiveColorTheme(() => {
        const fresh = this.readingState.get(document.uri);
        if (pdfConfig().defaultTheme === 'auto') post({ type: 'pdf/setTheme', theme: fresh.theme });
      }),
    ];

    panel.onDidDispose(() => {
      void this.readingState.set(document.uri, position satisfies ReadingPosition);
      for (const subscription of subscriptions) subscription.dispose();
    });
  }

  /** Resolves settings plus the webview URIs pdf.js needs for its data files. */
  private viewerOptions(webview: vscode.Webview): PdfViewerOptions {
    const config = pdfConfig();
    const dist = webviewDistUri(this.context.extensionUri);
    const asUrl = (name: string) =>
      `${webview.asWebviewUri(vscode.Uri.joinPath(dist, name)).toString()}/`;

    return {
      zoomStep: config.zoomStep,
      minZoom: config.minZoom,
      maxZoom: config.maxZoom,
      renderWindow: config.renderWindow,
      maxCanvasPixels: config.maxCanvasPixels,
      textLayer: config.textLayer,
      protectImages: config.protectImages,
      minProtectedImageArea: config.minProtectedImageArea,
      maxProtectedImageCoverage: config.maxProtectedImageCoverage,
      themes: config.themes,
      cMapUrl: asUrl('cmaps'),
      standardFontDataUrl: asUrl('standard_fonts'),
    };
  }
}

/**
 * Re-wraps bytes as a plain `Uint8Array` over the same memory.
 *
 * `workspace.fs.readFile` returns a Node `Buffer`. VS Code only transfers typed
 * arrays to a webview as binary when the constructor is literally one of the
 * standard typed arrays; anything else, `Buffer` included, is JSON-encoded and
 * arrives as `{ type: 'Buffer', data: [...] }`, which pdf.js rejects.
 */
function asPlainUint8Array(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? 'document.pdf';
}
