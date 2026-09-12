import * as vscode from 'vscode';
import type { NotesStore } from '../store/NotesStore.js';
import { buildWebviewHtml, webviewDistUri } from '../webview/html.js';
import type { ExportFormat } from '../webview/protocol.js';
import { NotesController } from './NotesController.js';

export const NOTES_VIEW_ID = 'paperdesk.notesView';

/** Hosts the compact notes UI in the activity bar. */
export class NotesViewProvider implements vscode.WebviewViewProvider {
  private controller?: NotesController;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly store: NotesStore,
    private readonly onExport: (fileName: string | null, format: ExportFormat) => Promise<void>,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [webviewDistUri(this.context.extensionUri)],
    };
    view.webview.html = buildWebviewHtml({
      webview: view.webview,
      extensionUri: this.context.extensionUri,
      mode: this.context.extensionMode,
      entry: 'notes',
      title: 'Notes & Tasks',
    });

    this.controller?.dispose();
    this.controller = new NotesController({
      webview: view.webview,
      store: this.store,
      density: 'compact',
      onExport: this.onExport,
    });

    view.onDidDispose(() => {
      this.controller?.dispose();
      this.controller = undefined;
    });
  }

  /** Focuses the sidebar and opens a specific note in it. */
  async reveal(fileName?: string): Promise<void> {
    await vscode.commands.executeCommand(`${NOTES_VIEW_ID}.focus`);
    if (fileName) await this.controller?.reveal(fileName);
  }
}
