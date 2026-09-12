import * as vscode from 'vscode';
import { appendTask } from './core/tree.js';
import { ExportService } from './export/ExportService.js';
import { NotesPanel } from './notes/NotesPanel.js';
import { NOTES_VIEW_ID, NotesViewProvider } from './notes/NotesViewProvider.js';
import { PdfEditorProvider } from './pdf/PdfEditorProvider.js';
import { NotesStore } from './store/NotesStore.js';
import { ReadingState } from './store/ReadingState.js';
import type { ExportFormat } from './webview/protocol.js';

/** Title given to the note quick-captured tasks land in when no note exists. */
const INBOX_TITLE = 'Inbox';

let notesStore: NotesStore | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const store = new NotesStore();
  notesStore = store;

  const exporter = new ExportService(context.extensionUri, store);
  const runExport = (fileName: string | null, format: ExportFormat) => exporter.run(fileName, format);

  const sidebar = new NotesViewProvider(context, store, runExport);
  const openPanel = () => NotesPanel.show(context, store, runExport);

  context.subscriptions.push(
    store,
    PdfEditorProvider.register(context, new ReadingState(context.globalState)),
    vscode.window.registerWebviewViewProvider(NOTES_VIEW_ID, sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),

    command('paperdesk.openNotes', () => void openPanel()),

    command('paperdesk.newNote', async () => {
      requireWorkspace();
      const title = await vscode.window.showInputBox({
        title: 'New Note',
        prompt: 'Name this note',
        validateInput: (value) => (value.trim() ? undefined : 'A note needs a name.'),
      });
      if (!title?.trim()) return;

      const note = await store.create(title.trim());
      await openPanel().reveal(note.fileName);
    }),

    command('paperdesk.quickAddTask', async () => {
      requireWorkspace();
      const fileName = await pickNoteForTask(store);
      if (!fileName) return;

      const title = await vscode.window.showInputBox({
        title: 'Quick Add Task',
        prompt: 'What needs doing?',
        validateInput: (value) => (value.trim() ? undefined : 'A task needs a title.'),
      });
      if (!title?.trim()) return;

      const note = await store.get(fileName);
      if (!note) return;

      store.update(fileName, { tasks: appendTask(note.tasks, undefined, title.trim()).tasks });
      void vscode.window.setStatusBarMessage(`$(check) Added to ${note.title}`, 2500);
    }),

    command('paperdesk.revealNotesFolder', async () => {
      const folder = requireWorkspace() && store.folderUri;
      if (!folder) return;
      await vscode.workspace.fs.createDirectory(folder);
      await vscode.commands.executeCommand('revealInExplorer', folder);
    }),

    command('paperdesk.exportMarkdown', () => exporter.pickAndRun('markdown')),
    command('paperdesk.exportPdf', () => exporter.pickAndRun('pdf')),
    command('paperdesk.previewExport', () => exporter.pickAndRun('preview')),
  );
}

export async function deactivate(): Promise<void> {
  // Debounced edits would otherwise be lost when the window closes mid-typing.
  await notesStore?.flushAll();
}

/** Registers a command whose failures surface as a message instead of vanishing. */
function command(id: string, handler: () => unknown): vscode.Disposable {
  return vscode.commands.registerCommand(id, async () => {
    try {
      await handler();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`PaperDesk: ${message}`);
    }
  });
}

function requireWorkspace(): true {
  if (!vscode.workspace.workspaceFolders?.length) {
    throw new Error('Open a folder first — notes are stored inside your workspace.');
  }
  return true;
}

/**
 * Chooses where a quick-captured task goes. With no notes, an Inbox note is
 * created so capturing a thought never requires setting anything up first.
 */
async function pickNoteForTask(store: NotesStore): Promise<string | undefined> {
  const notes = await store.list();
  if (notes.length === 0) return (await store.create(INBOX_TITLE)).fileName;
  if (notes.length === 1) return notes[0]?.fileName;

  const picked = await vscode.window.showQuickPick(
    notes.map((note) => ({
      label: note.title,
      description: note.total > 0 ? `${note.done}/${note.total} done` : undefined,
      fileName: note.fileName,
    })),
    { title: 'Quick Add Task', placeHolder: 'Add the task to which note?' },
  );
  return picked?.fileName;
}
