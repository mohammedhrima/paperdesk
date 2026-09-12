import { createContext, useContext, useState, type ReactNode } from 'react';
import type { TaskNode } from '../../core/model';
import type { DropPosition, TaskEditor } from './useTaskEditor';
import { TaskRow } from './TaskRow';

interface DragState {
  readonly draggedId: string | null;
  readonly hint: { readonly id: string; readonly position: DropPosition } | null;
  readonly start: (id: string) => void;
  readonly hover: (id: string, position: DropPosition) => void;
  /** Finishes a drag, applying the move only if it ended on a valid drop target. */
  readonly end: (dropped: boolean) => void;
}

const DragContext = createContext<DragState | null>(null);

export function useDrag(): DragState {
  const context = useContext(DragContext);
  if (!context) throw new Error('useDrag must be used inside <TaskTree>.');
  return context;
}

interface TaskTreeProps {
  readonly tasks: readonly TaskNode[];
  readonly editor: TaskEditor;
  readonly hideCompleted: boolean;
  readonly onOpenLink: (href: string) => void;
  readonly footer?: ReactNode;
}

/**
 * The outline of tasks for one note.
 *
 * Owns the transient drag state — which row is being dragged and where it
 * would land — so rows can draw drop indicators without prop-drilling it
 * through every level of nesting.
 */
export function TaskTree({ tasks, editor, hideCompleted, onOpenLink, footer }: TaskTreeProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hint, setHint] = useState<DragState['hint']>(null);

  const drag: DragState = {
    draggedId,
    hint,
    start: (id) => setDraggedId(id),
    hover: (id, position) => {
      const invalid = draggedId !== null && (id === draggedId || id.startsWith(`${draggedId}.`));
      setHint(invalid ? null : { id, position });
    },
    end: (dropped) => {
      if (dropped && draggedId && hint) editor.drop(draggedId, hint.id, hint.position);
      setDraggedId(null);
      setHint(null);
    },
  };

  return (
    <DragContext.Provider value={drag}>
      <ul className="pd-tree" role="tree" aria-label="Tasks">
        {tasks.map((task) =>
          hideCompleted && task.checked ? null : (
            <TaskRow
              key={task.id}
              task={task}
              depth={0}
              editor={editor}
              hideCompleted={hideCompleted}
              onOpenLink={onOpenLink}
            />
          ),
        )}
      </ul>
      {footer}
    </DragContext.Provider>
  );
}
