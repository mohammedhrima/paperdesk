import { useConfirm } from '../ui/ConfirmDialog';
import { Icon } from '../ui/Icon';
import { NoteDetail } from './NoteDetail';
import { NoteList } from './NoteList';
import { useNotes, type NotesActions } from './useNotes';

/**
 * The notes app. The same component renders the sidebar and the full tab; the
 * host's `density` decides whether the note list gets its own column.
 */
export function App() {
  const { state, actions } = useNotes();
  const { confirm, dialog } = useConfirm();
  const { notes, active, density, settings, ready, error } = state;
  const comfortable = density === 'comfortable';

  if (!ready) return <div className="pd-app pd-app--loading" aria-busy="true" />;

  return (
    <div className={`pd-app pd-app--${density}`}>
      {comfortable && notes.length > 0 && (
        <NoteList notes={notes} activeFileName={active?.fileName ?? null} actions={actions} />
      )}

      <main className="pd-app__main">
        {error && (
          <div className="pd-banner" role="alert">
            <span>{error}</span>
            <button type="button" className="pd-icon-button" aria-label="Dismiss" onClick={actions.dismissError}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {active ? (
          <NoteDetail
            // Remount per note so collapsed state, focus and zoom never leak between notes.
            key={active.fileName}
            note={active}
            notes={notes}
            settings={settings}
            density={density}
            actions={actions}
            confirm={confirm}
          />
        ) : (
          <EmptyState compact={!comfortable} actions={actions} />
        )}
      </main>

      {dialog}
    </div>
  );
}

function EmptyState({ compact, actions }: { readonly compact: boolean; readonly actions: NotesActions }) {
  return (
    <div className={`pd-empty${compact ? ' pd-empty--compact' : ''}`}>
      <div className="pd-empty__art" aria-hidden="true">
        <Icon name="notes" size={compact ? 28 : 40} strokeWidth={1.1} />
      </div>
      <h2 className="pd-empty__title">Capture what matters</h2>
      <p className="pd-empty__text">
        Notes and nested tasks, saved as plain Markdown in your workspace — readable anywhere, yours forever.
      </p>
      <button type="button" className="pd-button" onClick={() => actions.create()}>
        <Icon name="plus" size={14} /> Create your first note
      </button>
      {!compact && (
        <ul className="pd-empty__tips">
          <li>
            <kbd className="pd-kbd">Enter</kbd> new task
          </li>
          <li>
            <kbd className="pd-kbd">Tab</kbd> make subtask
          </li>
          <li>
            <kbd className="pd-kbd">Ctrl</kbd>+<kbd className="pd-kbd">Enter</kbd> complete
          </li>
          <li>
            <kbd className="pd-kbd">Shift</kbd>+<kbd className="pd-kbd">Enter</kbd> add notes
          </li>
        </ul>
      )}
    </div>
  );
}
