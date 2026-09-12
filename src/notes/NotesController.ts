import * as vscode from 'vscode';
import { notesConfig } from '../config.js';
import type { NotesStore } from '../store/NotesStore.js';
import type {
  Density,
  ExportFormat,
  NotesHostMessage,
  NotesWebviewMessage,
} from '../webview/protocol.js';

export interface NotesControllerOptions {
  readonly webview: vscode.Webview;
  readonly store: NotesStore;
  readonly density: Density;
  readonly onExport: (fileName: string | null, format: ExportFormat) => Promise<void>;
}

/**
 * Drives one notes webview.
 *
 * The sidebar and the full tab are the same React app at two sizes, so they are
 * the same controller too — the only difference is the `density` it announces.
 * The controller owns which note that particular surface has open, which lets
 * the sidebar stay on a quick-capture note while the tab shows another.
 */
export class NotesController implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private activeFileName: string | null = null;
  /** True while this surface's own edit is being applied to the store. */
  private applyingOwnEdit = false;

  constructor(private readonly options: NotesControllerOptions) {
    this.disposables.push(
      options.webview.onDidReceiveMessage((message: NotesWebviewMessage) =>
        this.handle(message).catch((error: unknown) => this.reportError(error)),
      ),
      // The store fires synchronously inside `update`, so the flag reliably
      // tells this surface's own edits apart from everyone else's.
      options.store.onDidChange(() => void (this.applyingOwnEdit ? this.pushList() : this.pushState())),
    );
  }

  /** Opens a note in this surface and brings it to the user's attention. */
  async reveal(fileName: string): Promise<void> {
    this.activeFileName = fileName;
    await this.pushState();
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }

  // -------------------------------------------------------------------------

  private async handle(message: NotesWebviewMessage): Promise<void> {
    const { store } = this.options;

    switch (message.type) {
      case 'notes/ready':
        this.post({
          type: 'notes/settings',
          settings: pickSettings(),
          density: this.options.density,
        });
        await this.pushState();
        return;

      case 'notes/select':
        this.activeFileName = message.fileName;
        return this.pushState();

      case 'notes/create': {
        const title = message.title ?? (await promptForTitle());
        if (title === undefined) return;
        const note = await store.create(title);
        this.activeFileName = note.fileName;
        return this.pushState();
      }

      case 'notes/rename':
        await store.rename(message.fileName, message.title);
        // The file name may have changed with the title; follow it.
        this.activeFileName =
          (await store.list()).find((note) => note.title === message.title)?.fileName ?? null;
        return this.pushState();

      case 'notes/update':
        this.applyingOwnEdit = true;
        try {
          store.update(message.fileName, { tasks: message.tasks, intro: message.intro });
        } finally {
          this.applyingOwnEdit = false;
        }
        return;

      case 'notes/openPanel':
        await vscode.commands.executeCommand('paperdesk.openNotes');
        return;

      case 'notes/openLink':
        if (isSafeLink(message.href)) await vscode.env.openExternal(vscode.Uri.parse(message.href));
        return;

      case 'notes/confirmDelete': {
        if (!(await confirmDelete(message.title))) return;
        await store.delete(message.fileName);
        if (this.activeFileName === message.fileName) this.activeFileName = null;
        return this.pushState();
      }

      case 'notes/delete':
        await store.delete(message.fileName);
        if (this.activeFileName === message.fileName) this.activeFileName = null;
        return this.pushState();

      case 'notes/openInEditor': {
        const uri = store.fileUri(message.fileName);
        if (!uri) return;
        await store.flushAll();
        await vscode.window.showTextDocument(uri, { preview: false });
        return;
      }

      case 'notes/export':
        return this.options.onExport(message.fileName, message.format);
    }
  }

  private async pushState(): Promise<void> {
    const { store } = this.options;
    const notes = await store.list();

    // Fall back to the most recent note so the surface is never blank while
    // notes exist — an empty pane reads like a bug.
    const fileName = this.activeFileName ?? notes[0]?.fileName ?? null;
    this.activeFileName = fileName;

    this.post({
      type: 'notes/state',
      notes,
      active: fileName ? ((await store.get(fileName)) ?? null) : null,
    });
  }

  private async pushList(): Promise<void> {
    this.post({ type: 'notes/list', notes: await this.options.store.list() });
  }

  private post(message: NotesHostMessage): void {
    void this.options.webview.postMessage(message);
  }

  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.post({ type: 'notes/error', message });
    void vscode.window.showErrorMessage(`PaperDesk: ${message}`);
  }
}

function pickSettings() {
  const config = notesConfig();
  return {
    cascadeCompletion: config.cascadeCompletion,
    confirmBeforeDelete: config.confirmBeforeDelete,
  };
}

/** Only web and mail links leave the webview; anything else could run a command. */
function isSafeLink(href: string): boolean {
  return /^(https?:|mailto:)/i.test(href);
}

async function promptForTitle(): Promise<string | undefined> {
  const title = await vscode.window.showInputBox({
    title: 'New Note',
    prompt: 'Name this note',
    placeHolder: 'Reading List',
    validateInput: (value) => (value.trim() ? undefined : 'A note needs a name.'),
  });
  return title?.trim() || undefined;
}

async function confirmDelete(title: string): Promise<boolean> {
  if (!notesConfig().confirmBeforeDelete) return true;
  const choice = await vscode.window.showWarningMessage(
    `Delete “${title}”?`,
    { modal: true, detail: 'The file is moved to the trash and can be restored from there.' },
    'Delete',
  );
  return choice === 'Delete';
}
