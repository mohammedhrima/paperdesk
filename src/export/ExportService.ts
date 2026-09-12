import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as vscode from 'vscode';
import { exportConfig } from '../config.js';
import type { NoteDoc } from '../core/model.js';
import { serializeNote } from '../core/markdown/serialize.js';
import { slugify, type NotesStore } from '../store/NotesStore.js';
import type { ExportFormat } from '../webview/protocol.js';
import { renderNotesHtml } from './renderHtml.js';
import { findBrowser, printToPdf } from './toPdf.js';

const ALL_NOTES_TITLE = 'Notes & Tasks';
const PREVIEW_VIEW_TYPE = 'paperdesk.exportPreview';

/**
 * Turns notes into files people can read outside the editor.
 *
 * Every format starts from the same notes and, for HTML-based outputs, the same
 * stylesheet — so a preview is an honest picture of the PDF it precedes.
 */
export class ExportService {
  private previewPanel?: vscode.WebviewPanel;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: NotesStore,
  ) {}

  /** Exports one note, or every note when `fileName` is `null`. */
  async run(fileName: string | null, format: ExportFormat): Promise<void> {
    await this.store.flushAll();
    const notes = await this.collect(fileName);

    if (notes.length === 0) {
      void vscode.window.showInformationMessage('PaperDesk: there are no notes to export yet.');
      return;
    }

    switch (format) {
      case 'markdown':
        return this.exportMarkdown(notes);
      case 'pdf':
        return this.exportPdf(notes);
      case 'preview':
        return this.preview(notes);
    }
  }

  /** Asks which note to export, for commands invoked from the palette. */
  async pickAndRun(format: ExportFormat): Promise<void> {
    const notes = await this.store.list();
    if (notes.length === 0) {
      void vscode.window.showInformationMessage('PaperDesk: there are no notes to export yet.');
      return;
    }

    const allItem = { label: '$(files) All notes', description: `${notes.length} notes`, fileName: null };
    const picked = await vscode.window.showQuickPick(
      [
        allItem,
        ...notes.map((note) => ({
          label: `$(note) ${note.title}`,
          description: note.total > 0 ? `${note.done}/${note.total} done` : '',
          fileName: note.fileName as string | null,
        })),
      ],
      { title: 'Export which notes?', placeHolder: 'Choose a note, or export everything' },
    );

    if (picked) await this.run(picked.fileName, format);
  }

  // -------------------------------------------------------------------------

  private async collect(fileName: string | null): Promise<NoteDoc[]> {
    if (fileName) {
      const note = await this.store.get(fileName);
      return note ? [note] : [];
    }
    const summaries = await this.store.list();
    const notes = await Promise.all(summaries.map((summary) => this.store.get(summary.fileName)));
    return notes.filter((note): note is NoteDoc => note !== undefined);
  }

  private async exportMarkdown(notes: NoteDoc[]): Promise<void> {
    const target = await this.askForTarget(notes, 'md', 'Markdown');
    if (!target) return;

    const config = exportConfig();
    const options = {
      includeCompleted: config.includeCompleted,
      includeFrontmatter: config.includeFrontmatter,
    };

    // A single note exports as itself. Several notes are joined into one
    // document, each under its own heading so the result still reads cleanly.
    const markdown =
      notes.length === 1 && notes[0]
        ? withHeading(notes[0], serializeNote(notes[0], options), config.includeFrontmatter)
        : notes
            .map((note) => withHeading(note, serializeNote(note, options), false, 2))
            .join('\n---\n\n');

    const content = notes.length === 1 ? markdown : `# ${ALL_NOTES_TITLE}\n\n${markdown}`;
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(content));
    await this.announce(target, 'Markdown');
  }

  private async exportPdf(notes: NoteDoc[]): Promise<void> {
    const config = exportConfig();
    const browser = await findBrowser(config.browserPath);
    const html = await this.renderHtml(notes);

    if (!browser) return this.fallbackToBrowserPrint(notes, html);

    const target = await this.askForTarget(notes, 'pdf', 'PDF');
    if (!target) return;

    const workDir = await mkdtemp(path.join(tmpdir(), 'paperdesk-export-'));
    try {
      const htmlPath = path.join(workDir, 'document.html');
      await writeFile(htmlPath, html, 'utf8');

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'PaperDesk: printing PDF…' },
        () => printToPdf({ htmlPath, outputPath: target.fsPath, browserPath: browser }),
      );
      await this.announce(target, 'PDF');
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /**
   * Without a browser to print with, hand the user a styled HTML file opened in
   * whatever browser they do have. It is one keystroke from a PDF, which beats
   * an error message that leaves them with nothing.
   */
  private async fallbackToBrowserPrint(notes: NoteDoc[], html: string): Promise<void> {
    const dir = path.join(tmpdir(), 'paperdesk-export');
    await mkdir(dir, { recursive: true });
    const htmlPath = path.join(dir, `${fileStem(notes)}.html`);
    await writeFile(htmlPath, html, 'utf8');

    const choice = await vscode.window.showWarningMessage(
      'PaperDesk could not find Chrome, Chromium, Edge or Brave to print with.',
      {
        modal: true,
        detail:
          'The styled document can be opened in your browser instead — use Print → Save as PDF there. ' +
          'You can also point the "paperdesk.export.browserPath" setting at a browser executable.',
      },
      'Open in Browser',
      'Open Settings',
    );

    if (choice === 'Open in Browser') {
      await vscode.env.openExternal(vscode.Uri.file(htmlPath));
    } else if (choice === 'Open Settings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'paperdesk.export.browserPath');
    }
  }

  private async preview(notes: NoteDoc[]): Promise<void> {
    const title = notes.length === 1 ? (notes[0]?.title ?? ALL_NOTES_TITLE) : ALL_NOTES_TITLE;

    if (!this.previewPanel) {
      this.previewPanel = vscode.window.createWebviewPanel(
        PREVIEW_VIEW_TYPE,
        title,
        { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
        // The document is static: no scripts, no local files.
        { enableScripts: false, localResourceRoots: [] },
      );
      this.previewPanel.onDidDispose(() => (this.previewPanel = undefined));
    }

    const panel = this.previewPanel;
    panel.title = `Preview: ${title}`;
    panel.webview.html = await this.renderHtml(notes, {
      headExtras: `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src ${panel.webview.cspSource} data: https:;">`,
    });
    panel.reveal(undefined, true);
  }

  private async renderHtml(notes: NoteDoc[], extra: { headExtras?: string } = {}): Promise<string> {
    const stylesheetPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'theme.css').fsPath;
    return renderNotesHtml(notes, {
      config: exportConfig(),
      stylesheet: await readFile(stylesheetPath, 'utf8'),
      documentTitle: ALL_NOTES_TITLE,
      ...extra,
    });
  }

  private async askForTarget(
    notes: NoteDoc[],
    extension: string,
    label: string,
  ): Promise<vscode.Uri | undefined> {
    const folder = this.store.workspaceFolder?.uri ?? vscode.Uri.file(tmpdir());
    return vscode.window.showSaveDialog({
      title: `Export to ${label}`,
      saveLabel: 'Export',
      defaultUri: vscode.Uri.joinPath(folder, `${fileStem(notes)}.${extension}`),
      filters: { [label]: [extension] },
    });
  }

  private async announce(target: vscode.Uri, label: string): Promise<void> {
    const choice = await vscode.window.showInformationMessage(
      `PaperDesk: exported ${label} to ${path.basename(target.fsPath)}.`,
      'Open',
      'Reveal in Folder',
    );
    if (choice === 'Open') {
      await vscode.commands.executeCommand('vscode.open', target);
    } else if (choice === 'Reveal in Folder') {
      await vscode.commands.executeCommand('revealFileInOS', target);
    }
  }
}

/**
 * Puts the note's title at the top of its exported Markdown. Frontmatter
 * already carries the title, so it is only added when frontmatter is omitted.
 */
function withHeading(note: NoteDoc, markdown: string, hasFrontmatter: boolean, level = 1): string {
  if (hasFrontmatter) return markdown;
  return `${'#'.repeat(level)} ${note.title}\n\n${markdown}`;
}

function fileStem(notes: readonly NoteDoc[]): string {
  const single = notes.length === 1 ? notes[0] : undefined;
  return slugify(single?.title ?? ALL_NOTES_TITLE) || 'notes';
}
