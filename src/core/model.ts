/**
 * The note document model.
 *
 * A note is a plain Markdown file on disk. Nothing here exists only in memory:
 * every field maps onto something a human could have typed by hand, which is
 * what keeps the format readable, diffable and free of lock-in.
 *
 *     ---
 *     title: Reading List         <- NoteDoc.title
 *     ---
 *
 *     Some intro prose.           <- NoteDoc.intro
 *
 *     - [ ] Finish chapter 3      <- TaskNode.title / .checked
 *
 *       Notes about the task.     <- TaskNode.body
 *
 *       - [x] Summarize section 1 <- TaskNode.children
 */

/** A single task, which may carry a Markdown body and nested subtasks. */
export interface TaskNode {
  /**
   * Identity for the lifetime of one parse. Derived from the task's position in
   * the tree, never written to disk — the Markdown stays free of metadata.
   */
  readonly id: string;
  /** Inline Markdown of the task's first line, verbatim. */
  readonly title: string;
  readonly checked: boolean;
  /** Markdown blocks between the title and the subtask list, verbatim and dedented. */
  readonly body: string;
  readonly children: readonly TaskNode[];
}

/** One `.md` file in the notes folder. */
export interface NoteDoc {
  /**
   * File name inside the notes folder, including the extension. This is the
   * note's identity — renaming the file renames the note.
   */
  readonly fileName: string;
  readonly title: string;
  readonly created: string;
  readonly updated: string;
  /**
   * Frontmatter keys the model does not interpret. Preserved so hand-added
   * metadata survives a round trip untouched.
   */
  readonly extraFrontmatter: Readonly<Record<string, unknown>>;
  /** Markdown before the first task list, verbatim. */
  readonly intro: string;
  readonly tasks: readonly TaskNode[];
  /** Markdown after the task list, verbatim. Preserved so nothing is ever dropped. */
  readonly trailing: string;
}

/**
 * A task's location in the tree, as sibling indices from the root.
 * `[0, 2, 1]` is "the second subtask of the third subtask of the first task".
 */
export type TaskPath = readonly number[];

/** Rolled-up completion for a task or a whole document. */
export interface Progress {
  readonly done: number;
  readonly total: number;
}

/** Builds the id used for a task at `path`. */
export function pathToId(path: TaskPath): string {
  return path.join('.');
}

/** Parses an id produced by {@link pathToId} back into a path. */
export function idToPath(id: string): TaskPath {
  return id.length === 0 ? [] : id.split('.').map(Number);
}

/** Creates a task with sensible defaults, so callers never assemble one by hand. */
export function createTask(overrides: Partial<TaskNode> = {}): TaskNode {
  return { id: '', title: '', checked: false, body: '', children: [], ...overrides };
}

/** Creates an empty note. `now` is injected so tests stay deterministic. */
export function createNote(fileName: string, title: string, now: string): NoteDoc {
  return {
    fileName,
    title,
    created: now,
    updated: now,
    extraFrontmatter: {},
    intro: '',
    tasks: [],
    trailing: '',
  };
}
