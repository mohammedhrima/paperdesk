import { useEffect, useRef, useState } from 'react';
import type { NoteDoc, TaskNode } from '../../core/model';
import { idToPath } from '../../core/model';
import { getTask, progressOf } from '../../core/tree';
import type { Density, NoteSummary, NotesSettings } from '../protocol';
import type { ConfirmRequest } from '../ui/ConfirmDialog';
import { formatRelativeTime, percent } from '../ui/format';
import { Icon } from '../ui/Icon';
import { Markdown } from '../ui/Markdown';
import { Menu, type MenuItem } from '../ui/Menu';
import { BodyEditor } from './BodyEditor';
import { TaskTree } from './TaskTree';
import type { NotesActions } from './useNotes';
import { useTaskEditor } from './useTaskEditor';

interface NoteDetailProps {
  readonly note: NoteDoc;
  readonly notes: readonly NoteSummary[];
  readonly settings: NotesSettings;
  readonly density: Density;
  readonly actions: NotesActions;
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>;
}

/** A single note: its title, progress, description and task outline. */
export function NoteDetail({ note, notes, settings, density, actions, confirm }: NoteDetailProps) {
  const [hideCompleted, setHideCompleted] = useState(false);
  const compact = density === 'compact';

  const editor = useTaskEditor({
    fileName: note.fileName,
    tasks: note.tasks,
    settings,
    hideCompleted,
    setTasks: actions.setTasks,
    confirm,
  });

  const zoomed = editor.zoomId ? getTask(note.tasks, idToPath(editor.zoomId)) : undefined;
  const visibleTasks: readonly TaskNode[] = zoomed ? zoomed.children : note.tasks;
  const { done, total } = progressOf(note.tasks);

  // A focused task can disappear — deleted, or the file changed on disk.
  const { zoomId, setZoomId } = editor;
  useEffect(() => {
    if (zoomId && !zoomed) setZoomId(null);
  }, [zoomId, zoomed, setZoomId]);

  const exportItems: MenuItem[] = [
    { label: 'Preview', icon: 'eye', onSelect: () => actions.exportNote(note.fileName, 'preview') },
    { label: 'Markdown (.md)', icon: 'file', onSelect: () => actions.exportNote(note.fileName, 'markdown') },
    { label: 'PDF (.pdf)', icon: 'download', onSelect: () => actions.exportNote(note.fileName, 'pdf') },
  ];

  const moreItems: MenuItem[] = [
    { label: 'Collapse all', icon: 'chevronRight', onSelect: () => editor.setAllCollapsed(true) },
    { label: 'Expand all', icon: 'chevronDown', onSelect: () => editor.setAllCollapsed(false) },
    { label: 'Open Markdown file', icon: 'file', onSelect: () => actions.openInEditor(note.fileName), separated: true },
    ...(compact ? exportItems.map((item, index) => ({ ...item, label: `Export: ${item.label}`, separated: index === 0 })) : []),
    { label: 'Delete note', icon: 'trash', danger: true, onSelect: () => actions.remove(note), separated: true },
  ];

  return (
    <article className={`pd-detail pd-detail--${density}`}>
      <header className="pd-detail__header">
        <div className="pd-detail__toprow">
          {compact && notes.length > 0 ? (
            <NoteSwitcher note={note} notes={notes} actions={actions} />
          ) : (
            <NoteTitle note={note} onRename={(title) => actions.rename(note.fileName, title)} />
          )}

          <div className="pd-detail__tools">
            <button
              type="button"
              className="pd-icon-button"
              aria-pressed={hideCompleted}
              title={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
              aria-label={hideCompleted ? 'Show completed tasks' : 'Hide completed tasks'}
              onClick={() => setHideCompleted((value) => !value)}
            >
              <Icon name={hideCompleted ? 'eyeOff' : 'eye'} />
            </button>
            {!compact && (
              <Menu
                label="Export"
                triggerClassName="pd-button pd-button--ghost"
                trigger={
                  <>
                    <Icon name="download" size={14} /> Export
                  </>
                }
                items={exportItems}
              />
            )}
            <Menu label="More actions" items={moreItems} />
          </div>
        </div>

        <div className="pd-detail__meta">
          {total > 0 ? (
            <>
              <div className="pd-progress" aria-hidden="true">
                <div className="pd-progress__fill" style={{ width: `${percent(done, total)}%` }} />
              </div>
              <span className="pd-detail__stat">
                {done} of {total} done
              </span>
            </>
          ) : (
            <span className="pd-detail__stat">No tasks yet</span>
          )}
          {!compact && note.updated && (
            <span className="pd-detail__stat pd-detail__stat--faint">Edited {formatRelativeTime(note.updated)}</span>
          )}
        </div>
      </header>

      {!compact && !zoomed && (
        <BodyEditor
          className="pd-detail__intro"
          value={note.intro}
          placeholder="Add a description…"
          onChange={actions.setIntro}
          onOpenLink={actions.openLink}
        />
      )}

      {zoomed && (
        <div className="pd-zoom">
          <button type="button" className="pd-zoom__back" onClick={() => editor.setZoomId(null)}>
            <Icon name="chevronLeft" size={14} /> All tasks
          </button>
          <div className="pd-zoom__title">
            <Markdown source={zoomed.title || 'Untitled task'} inline onOpenLink={actions.openLink} />
          </div>
        </div>
      )}

      <section className="pd-detail__tasks" aria-label="Tasks">
        <TaskTree
          tasks={visibleTasks}
          editor={editor}
          hideCompleted={hideCompleted}
          onOpenLink={actions.openLink}
          footer={<AddTaskInput onAdd={(title) => editor.addAtEnd(editor.zoomId, title)} />}
        />

        {visibleTasks.length === 0 && (
          <p className="pd-detail__hint">
            Type a task below and press <kbd className="pd-kbd">Enter</kbd>. Use <kbd className="pd-kbd">Tab</kbd> to nest it.
          </p>
        )}
      </section>
    </article>
  );
}

/** The note's title, edited in place. */
function NoteTitle({ note, onRename }: { readonly note: NoteDoc; readonly onRename: (title: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commit = () => {
    const title = draft?.trim();
    setDraft(null);
    if (title && title !== note.title) onRename(title);
  };

  if (draft !== null) {
    return (
      <input
        ref={inputRef}
        className="pd-detail__title pd-detail__title--input"
        value={draft}
        aria-label="Note title"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    );
  }

  return (
    <h1 className="pd-detail__title" title="Click to rename" onClick={() => setDraft(note.title)}>
      {note.title}
    </h1>
  );
}

/** In the narrow sidebar, the title doubles as a switcher between notes. */
function NoteSwitcher({
  note,
  notes,
  actions,
}: {
  readonly note: NoteDoc;
  readonly notes: readonly NoteSummary[];
  readonly actions: NotesActions;
}) {
  return (
    <Menu
      label="Switch note"
      align="start"
      triggerClassName="pd-switcher"
      trigger={
        <>
          <span className="pd-switcher__title">{note.title}</span>
          <Icon name="chevronDown" size={12} strokeWidth={1.8} />
        </>
      }
      items={[
        ...notes.map((item) => ({
          label: item.title,
          icon: item.fileName === note.fileName ? ('check' as const) : undefined,
          hint: item.total > 0 ? `${item.done}/${item.total}` : undefined,
          onSelect: () => actions.select(item.fileName),
        })),
        { label: 'New note…', icon: 'plus', onSelect: () => actions.create(), separated: true },
        { label: 'Open full view', icon: 'external', onSelect: () => actions.openPanel() },
      ]}
    />
  );
}

/** A persistent "add a task" line at the end of the list, for rapid entry. */
function AddTaskInput({ onAdd }: { readonly onAdd: (title: string) => void }) {
  const [value, setValue] = useState('');

  return (
    <label className="pd-add">
      <Icon name="plus" size={14} />
      <input
        className="pd-add__input"
        value={value}
        placeholder="Add a task"
        aria-label="Add a task"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && value.trim()) {
            event.preventDefault();
            onAdd(value.trim());
            setValue('');
          } else if (event.key === 'Escape') {
            setValue('');
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
