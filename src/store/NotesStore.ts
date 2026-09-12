import * as vscode from 'vscode';
import { notesConfig } from '../config.js';
import { createNote, type NoteDoc } from '../core/model.js';
import { parseNote } from '../core/markdown/parse.js';
import { serializeNote } from '../core/markdown/serialize.js';
import { progressOf } from '../core/tree.js';
import type { NoteSummary } from '../webview/protocol.js';

const MARKDOWN_EXTENSION = '.md';

/**
 * Owns the notes folder.
 *
 * Notes are plain Markdown files, so the user — or another editor, or a git
 * checkout — can change them behind the extension's back. The store therefore
 * treats disk as the source of truth and keeps itself in sync through a file
 * watcher, while debouncing its own writes so typing does not thrash the disk.
 *
 * To avoid reacting to its own saves, every write records the exact text it
 * produced; a watcher event whose content matches is the echo of that write and
 * is ignored.
 */
export class NotesStore implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly pendingWrites = new Map<string, NodeJS.Timeout>();
  private readonly lastWritten = new Map<string, string>();
  private notes = new Map<string, NoteDoc>();
  private watcher?: vscode.FileSystemWatcher;
  private loaded = false;

  /** Fires whenever the set of notes or any note's content changes. */
  readonly onDidChange = this.emitter.event;

  constructor(private readonly clock: () => string = () => new Date().toISOString()) {
    this.disposables.push(
      this.emitter,
      vscode.workspace.onDidChangeWorkspaceFolders(() => void this.reload()),
    );
    this.watchNotesFolder();
  }

  /** The workspace folder notes are stored in, or `undefined` with no workspace open. */
  get workspaceFolder(): vscode.WorkspaceFolder | undefined {
    return vscode.workspace.workspaceFolders?.[0];
  }

  /** Absolute location of the notes folder, or `undefined` with no workspace open. */
  get folderUri(): vscode.Uri | undefined {
    const folder = this.workspaceFolder;
    if (!folder) return undefined;
    return vscode.Uri.joinPath(folder.uri, notesConfig(folder).folderName);
  }

  async list(): Promise<NoteSummary[]> {
    await this.ensureLoaded();
    return [...this.notes.values()]
      .map((note) => {
        const { done, total } = progressOf(note.tasks);
        return { fileName: note.fileName, title: note.title, updated: note.updated, done, total };
      })
      .sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  }

  async get(fileName: string): Promise<NoteDoc | undefined> {
    await this.ensureLoaded();
    return this.notes.get(fileName);
  }

  /** Creates a note with a unique file name derived from its title. */
  async create(title: string): Promise<NoteDoc> {
    await this.ensureLoaded();
    const folder = this.requireFolder();
    await vscode.workspace.fs.createDirectory(folder);

    const fileName = this.uniqueFileName(title);
    const note = createNote(fileName, title, this.clock());

    this.notes.set(fileName, note);
    await this.flush(note);
    this.emitter.fire();
    return note;
  }

  /**
   * Replaces a note's content and schedules a write. The in-memory copy updates
   * immediately so the UI never waits on the disk.
   */
  update(fileName: string, changes: Partial<Omit<NoteDoc, 'fileName'>>): NoteDoc | undefined {
    const existing = this.notes.get(fileName);
    if (!existing) return undefined;

    const next: NoteDoc = { ...existing, ...changes, fileName, updated: this.clock() };
    this.notes.set(fileName, next);
    this.scheduleWrite(next);
    this.emitter.fire();
    return next;
  }

  /** Renames a note's title, and its file along with it when the slug changes. */
  async rename(fileName: string, title: string): Promise<NoteDoc | undefined> {
    const existing = this.notes.get(fileName);
    if (!existing) return undefined;

    const desired = this.uniqueFileName(title, fileName);
    const renamed: NoteDoc = { ...existing, title, fileName: desired, updated: this.clock() };

    if (desired !== fileName) {
      await this.cancelPendingWrite(fileName);
      this.notes.delete(fileName);
      this.lastWritten.delete(fileName);
      await this.deleteFile(fileName);
    }

    this.notes.set(desired, renamed);
    await this.flush(renamed);
    this.emitter.fire();
    return renamed;
  }

  async delete(fileName: string): Promise<void> {
    await this.cancelPendingWrite(fileName);
    this.notes.delete(fileName);
    this.lastWritten.delete(fileName);
    await this.deleteFile(fileName);
    this.emitter.fire();
  }

  fileUri(fileName: string): vscode.Uri | undefined {
    const folder = this.folderUri;
    return folder ? vscode.Uri.joinPath(folder, fileName) : undefined;
  }

  /** Writes every pending change immediately. Called before export and on shutdown. */
  async flushAll(): Promise<void> {
    const names = [...this.pendingWrites.keys()];
    await Promise.all(
      names.map(async (fileName) => {
        await this.cancelPendingWrite(fileName);
        const note = this.notes.get(fileName);
        if (note) await this.flush(note);
      }),
    );
  }

  dispose(): void {
    for (const timer of this.pendingWrites.values()) clearTimeout(timer);
    this.pendingWrites.clear();
    this.watcher?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  // -------------------------------------------------------------------------

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.reload();
  }

  private async reload(): Promise<void> {
    this.loaded = true;
    this.notes = new Map();

    const folder = this.folderUri;
    if (!folder) return;

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(folder);
    } catch {
      // The folder simply does not exist yet; it is created with the first note.
      return;
    }

    for (const [fileName, type] of entries) {
      if (type !== vscode.FileType.File || !fileName.endsWith(MARKDOWN_EXTENSION)) continue;
      const note = await this.readFile(folder, fileName);
      if (note) this.notes.set(fileName, note);
    }
    this.emitter.fire();
  }

  private async readFile(folder: vscode.Uri, fileName: string): Promise<NoteDoc | undefined> {
    try {
      const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder, fileName));
      const source = new TextDecoder().decode(bytes);
      return parseNote(fileName, source, titleFromFileName(fileName));
    } catch {
      return undefined;
    }
  }

  private watchNotesFolder(): void {
    this.watcher?.dispose();
    const folder = this.workspaceFolder;
    if (!folder) return;

    const pattern = new vscode.RelativePattern(
      folder,
      `${notesConfig(folder).folderName}/*${MARKDOWN_EXTENSION}`,
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    this.watcher.onDidChange((uri) => void this.onExternalChange(uri));
    this.watcher.onDidCreate((uri) => void this.onExternalChange(uri));
    this.watcher.onDidDelete((uri) => void this.onExternalDelete(uri));
  }

  private async onExternalChange(uri: vscode.Uri): Promise<void> {
    const folder = this.folderUri;
    if (!folder) return;

    const fileName = basename(uri);
    // Our own write coming back around, or a write we are about to overwrite.
    if (this.pendingWrites.has(fileName)) return;

    const bytes = await vscode.workspace.fs.readFile(uri).then(
      (value) => value,
      () => undefined,
    );
    if (!bytes) return;

    const source = new TextDecoder().decode(bytes);
    if (this.lastWritten.get(fileName) === source) return;

    this.notes.set(fileName, parseNote(fileName, source, titleFromFileName(fileName)));
    this.emitter.fire();
  }

  private async onExternalDelete(uri: vscode.Uri): Promise<void> {
    const fileName = basename(uri);
    if (!this.notes.delete(fileName)) return;
    this.lastWritten.delete(fileName);
    this.emitter.fire();
  }

  private scheduleWrite(note: NoteDoc): void {
    const existing = this.pendingWrites.get(note.fileName);
    if (existing) clearTimeout(existing);

    const delay = notesConfig(this.workspaceFolder).saveDebounceMs;
    this.pendingWrites.set(
      note.fileName,
      setTimeout(() => {
        this.pendingWrites.delete(note.fileName);
        const latest = this.notes.get(note.fileName);
        if (latest) void this.flush(latest);
      }, delay),
    );
  }

  private async cancelPendingWrite(fileName: string): Promise<void> {
    const timer = this.pendingWrites.get(fileName);
    if (!timer) return;
    clearTimeout(timer);
    this.pendingWrites.delete(fileName);
  }

  private async flush(note: NoteDoc): Promise<void> {
    const uri = this.fileUri(note.fileName);
    if (!uri) return;

    const text = serializeNote(note);
    this.lastWritten.set(note.fileName, text);

    const folder = this.folderUri;
    if (folder) await vscode.workspace.fs.createDirectory(folder);
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(text));
  }

  private async deleteFile(fileName: string): Promise<void> {
    const uri = this.fileUri(fileName);
    if (!uri) return;
    try {
      await vscode.workspace.fs.delete(uri, { useTrash: true });
    } catch {
      // Already gone — the end state is what we wanted either way.
    }
  }

  private requireFolder(): vscode.Uri {
    const folder = this.folderUri;
    if (!folder) throw new Error('Open a folder before creating notes.');
    return folder;
  }

  /** Derives a file name from a title, adding a counter when one is taken. */
  private uniqueFileName(title: string, allowReuseOf?: string): string {
    const base = slugify(title) || 'note';
    for (let counter = 0; ; counter += 1) {
      const candidate = `${base}${counter === 0 ? '' : `-${counter}`}${MARKDOWN_EXTENSION}`;
      if (candidate === allowReuseOf || !this.notes.has(candidate)) return candidate;
    }
  }
}

/** Turns a title into a file-system-safe, readable slug. */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function titleFromFileName(fileName: string): string {
  const stem = fileName.slice(0, -MARKDOWN_EXTENSION.length);
  const spaced = stem.replace(/[-_]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function basename(uri: vscode.Uri): string {
  return uri.path.split('/').pop() ?? '';
}
