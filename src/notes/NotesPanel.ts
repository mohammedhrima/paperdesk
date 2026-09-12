import * as vscode from 'vscode';
import type { NotesStore } from '../store/NotesStore.js';
import { buildWebviewHtml, webviewDistUri } from '../webview/html.js';
import type { ExportFormat } from '../webview/protocol.js';
import { NotesController } from './NotesController.js';

const PANEL_VIEW_TYPE = 'paperdesk.notesPanel';

/**
 * The roomy, full-tab notes workspace.
 *
 * Only one exists at a time: reopening focuses the existing tab rather than
 * stacking duplicates that would each hold their own idea of what is selected.
 */
export class NotesPanel {
  private static current?: NotesPanel;

  private readonly controller: NotesController;
  private readonly disposables: vscode.Disposable[] = [];

  static show(
    context: vscode.ExtensionContext,
    store: NotesStore,
    onExport: (fileName: string | null, format: ExportFormat) => Promise<void>,
  ): NotesPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (NotesPanel.current) {
      NotesPanel.current.panel.reveal(column);
      return NotesPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(PANEL_VIEW_TYPE, 'Notes & Tasks', column, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [webviewDistUri(context.extensionUri)],
    });

    NotesPanel.current = new NotesPanel(panel, context, store, onExport);
    return NotesPanel.current;
  }

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    store: NotesStore,
    onExport: (fileName: string | null, format: ExportFormat) => Promise<void>,
  ) {
    panel.iconPath = {
      light: vscode.Uri.joinPath(context.extensionUri, 'media/notes-light.svg'),
      dark: vscode.Uri.joinPath(context.extensionUri, 'media/notes-dark.svg'),
    };
    panel.webview.html = buildWebviewHtml({
      webview: panel.webview,
      extensionUri: context.extensionUri,
      mode: context.extensionMode,
      entry: 'notes',
      title: 'Notes & Tasks',
    });

    this.controller = new NotesController({
      webview: panel.webview,
      store,
      density: 'comfortable',
      onExport,
    });

    panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  async reveal(fileName: string): Promise<void> {
    await this.controller.reveal(fileName);
  }

  private dispose(): void {
    NotesPanel.current = undefined;
    this.controller.dispose();
    this.panel.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}
