import { useCallback, useEffect, useRef, useState } from 'react';
import type { NoteDoc, TaskNode } from '../../core/model';
import type {
  Density,
  ExportFormat,
  NoteSummary,
  NotesHostMessage,
  NotesSettings,
  NotesWebviewMessage,
} from '../protocol';
import { postToHost, useHostMessages } from '../ui/host';

const post = (message: NotesWebviewMessage) => postToHost(message);

const DEFAULT_SETTINGS: NotesSettings = { cascadeCompletion: 'always', confirmBeforeDelete: true };

export interface NotesState {
  readonly ready: boolean;
  readonly notes: readonly NoteSummary[];
  readonly active: NoteDoc | null;
  readonly settings: NotesSettings;
  readonly density: Density;
  readonly error: string | null;
}

/**
 * The notes app's connection to the host.
 *
 * Edits apply to local state first and are sent afterwards, so the UI responds
 * on the same frame as the keystroke. The host persists them and refreshes the
 * list; it only replaces the open document when something outside this view
 * changed it.
 */
export function useNotes() {
  const [state, setState] = useState<NotesState>({
    ready: false,
    notes: [],
    active: null,
    settings: DEFAULT_SETTINGS,
    density: 'comfortable',
    error: null,
  });

  // The open document, kept outside React state as well so that several edits
  // in one frame each build on the previous one rather than on a stale render.
  const activeRef = useRef<NoteDoc | null>(null);

  useHostMessages<NotesHostMessage>((message) => {
    switch (message.type) {
      case 'notes/state':
        activeRef.current = message.active;
        setState((s) => ({ ...s, ready: true, notes: message.notes, active: message.active, error: null }));
        break;
      case 'notes/list':
        setState((s) => ({ ...s, notes: message.notes }));
        break;
      case 'notes/settings':
        setState((s) => ({ ...s, settings: message.settings, density: message.density }));
        break;
      case 'notes/error':
        setState((s) => ({ ...s, error: message.message }));
        break;
    }
  });

  useEffect(() => post({ type: 'notes/ready' }), []);

  /** Applies a change to the open note locally, then persists it. */
  const editActive = useCallback((change: (doc: NoteDoc) => Partial<Pick<NoteDoc, 'tasks' | 'intro'>>) => {
    const doc = activeRef.current;
    if (!doc) return;

    const next: NoteDoc = { ...doc, ...change(doc) };
    activeRef.current = next;
    setState((current) => ({ ...current, active: next }));
    post({ type: 'notes/update', fileName: next.fileName, tasks: next.tasks, intro: next.intro });
  }, []);

  const actions = {
    select: (fileName: string) => post({ type: 'notes/select', fileName }),
    create: (title?: string) => post({ type: 'notes/create', title }),
    rename: (fileName: string, title: string) => post({ type: 'notes/rename', fileName, title }),
    remove: (note: Pick<NoteSummary, 'fileName' | 'title'>) =>
      post({ type: 'notes/confirmDelete', fileName: note.fileName, title: note.title }),
    exportNote: (fileName: string | null, format: ExportFormat) =>
      post({ type: 'notes/export', fileName, format }),
    openInEditor: (fileName: string) => post({ type: 'notes/openInEditor', fileName }),
    openLink: (href: string) => post({ type: 'notes/openLink', href }),
    openPanel: () => post({ type: 'notes/openPanel' }),
    setTasks: (update: (tasks: readonly TaskNode[]) => readonly TaskNode[]) =>
      editActive((doc) => ({ tasks: update(doc.tasks) })),
    setIntro: (intro: string) => editActive(() => ({ intro })),
    dismissError: () => setState((s) => ({ ...s, error: null })),
  };

  return { state, actions };
}

export type NotesActions = ReturnType<typeof useNotes>['actions'];
