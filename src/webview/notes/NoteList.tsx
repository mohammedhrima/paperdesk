import { useMemo, useState } from 'react';
import type { NoteSummary } from '../protocol';
import { formatRelativeTime } from '../ui/format';
import { Icon } from '../ui/Icon';
import { Menu } from '../ui/Menu';
import { ProgressRing } from '../ui/ProgressRing';
import type { NotesActions } from './useNotes';

interface NoteListProps {
  readonly notes: readonly NoteSummary[];
  readonly activeFileName: string | null;
  readonly actions: NotesActions;
}

/** The left pane of the full-tab view: every note, searchable. */
export function NoteList({ notes, activeFileName, actions }: NoteListProps) {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return needle ? notes.filter((note) => note.title.toLocaleLowerCase().includes(needle)) : notes;
  }, [notes, query]);

  return (
    <nav className="pd-list" aria-label="Notes">
      <header className="pd-list__header">
        <span className="pd-list__heading">Notes</span>
        <span className="pd-list__total">{notes.length}</span>
        <button
          type="button"
          className="pd-icon-button pd-list__new"
          title="New note"
          aria-label="New note"
          onClick={() => actions.create()}
        >
          <Icon name="plus" />
        </button>
      </header>

      {notes.length > 3 && (
        <label className="pd-search">
          <Icon name="search" size={13} />
          <input
            type="search"
            value={query}
            placeholder="Filter notes"
            aria-label="Filter notes"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}

      <ul className="pd-list__items">
        {visible.map((note) => (
          <li key={note.fileName}>
            <div
              className={`pd-list__item${note.fileName === activeFileName ? ' pd-list__item--active' : ''}`}
              role="button"
              tabIndex={0}
              aria-current={note.fileName === activeFileName ? 'page' : undefined}
              onClick={() => actions.select(note.fileName)}
              onKeyDown={(event) => event.key === 'Enter' && actions.select(note.fileName)}
            >
              <ProgressRing done={note.done} total={note.total} />
              <span className="pd-list__text">
                <span className="pd-list__title">{note.title}</span>
                <span className="pd-list__meta">
                  {note.total > 0 ? `${note.done}/${note.total} · ` : ''}
                  {formatRelativeTime(note.updated)}
                </span>
              </span>
              <Menu
                label="Note actions"
                triggerClassName="pd-icon-button pd-list__menu"
                items={[
                  { label: 'Open Markdown file', icon: 'file', onSelect: () => actions.openInEditor(note.fileName) },
                  { label: 'Export to Markdown', icon: 'download', onSelect: () => actions.exportNote(note.fileName, 'markdown'), separated: true },
                  { label: 'Export to PDF', icon: 'download', onSelect: () => actions.exportNote(note.fileName, 'pdf') },
                  { label: 'Delete note', icon: 'trash', danger: true, onSelect: () => actions.remove(note), separated: true },
                ]}
              />
            </div>
          </li>
        ))}

        {visible.length === 0 && query && <li className="pd-list__empty">No notes match “{query}”.</li>}
      </ul>

      <footer className="pd-list__footer">
        <Menu
          label="Export all notes"
          align="start"
          triggerClassName="pd-button pd-button--ghost pd-list__export"
          trigger={
            <>
              <Icon name="download" size={14} /> Export all
            </>
          }
          items={[
            { label: 'Preview', icon: 'eye', onSelect: () => actions.exportNote(null, 'preview') },
            { label: 'Markdown (.md)', icon: 'file', onSelect: () => actions.exportNote(null, 'markdown') },
            { label: 'PDF (.pdf)', icon: 'download', onSelect: () => actions.exportNote(null, 'pdf') },
          ]}
        />
      </footer>
    </nav>
  );
}
