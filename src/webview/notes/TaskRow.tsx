import { useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent } from 'react';
import type { TaskNode } from '../../core/model';
import { serializeNote } from '../../core/markdown/serialize';
import { subtreeProgress } from '../../core/tree';
import { Icon } from '../ui/Icon';
import { Markdown } from '../ui/Markdown';
import { Menu } from '../ui/Menu';
import { BodyEditor } from './BodyEditor';
import { useDrag } from './TaskTree';
import type { DropPosition, TaskEditor } from './useTaskEditor';

/** Fraction of a row's height, from each edge, that means "drop beside" rather than "inside". */
const DROP_EDGE_RATIO = 0.3;

interface TaskRowProps {
  readonly task: TaskNode;
  readonly depth: number;
  readonly editor: TaskEditor;
  readonly hideCompleted: boolean;
  readonly onOpenLink: (href: string) => void;
}

/**
 * One task: its checkbox, title, notes and — recursively — its subtasks.
 *
 * The title shows rendered Markdown until it is focused, then becomes an input,
 * so a list reads cleanly but every row is a single click from being edited.
 */
export function TaskRow({ task, depth, editor, hideCompleted, onOpenLink }: TaskRowProps) {
  const drag = useDrag();
  const inputRef = useRef<HTMLInputElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [editingBody, setEditingBody] = useState(false);

  const editing = editor.focusId === task.id;
  const collapsed = editor.collapsed.has(task.id);
  const hasChildren = task.children.length > 0;
  const { done, total } = subtreeProgress(task);
  const hint = drag.hint?.id === task.id ? drag.hint.position : null;

  useLayoutEffect(() => {
    if (editing && document.activeElement !== inputRef.current) inputRef.current?.focus();
  }, [editing]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const mod = event.metaKey || event.ctrlKey;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (event.key === 'Enter' && mod) {
      handled();
      void editor.toggle(task.id);
    } else if (event.key === 'Enter' && event.shiftKey) {
      handled();
      setEditingBody(true);
    } else if (event.key === 'Enter') {
      handled();
      editor.addAfter(task.id);
    } else if (event.key === 'Tab') {
      handled();
      if (event.shiftKey) editor.outdent(task.id);
      else editor.indent(task.id);
    } else if (event.key === 'Backspace' && task.title === '' && !hasChildren) {
      handled();
      void editor.remove(task.id, { viaKeyboard: true });
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && event.altKey) {
      handled();
      editor.moveBy(task.id, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      handled();
      editor.focusNeighbour(task.id, event.key === 'ArrowUp' ? -1 : 1);
    } else if (event.key === 'Escape') {
      handled();
      inputRef.current?.blur();
    }
  };

  const onDragOver = (event: DragEvent) => {
    if (!drag.draggedId || !headRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';

    const rect = headRef.current.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    const position: DropPosition =
      ratio < DROP_EDGE_RATIO ? 'before' : ratio > 1 - DROP_EDGE_RATIO ? 'after' : 'inside';
    if (hint !== position) drag.hover(task.id, position);
  };

  const copyAsMarkdown = () => {
    const markdown = serializeNote(
      { fileName: '', title: '', created: '', updated: '', extraFrontmatter: {}, intro: '', trailing: '', tasks: [task] },
      { includeFrontmatter: false },
    );
    void navigator.clipboard.writeText(markdown);
  };

  const classes = [
    'pd-task',
    task.checked && 'pd-task--done',
    editing && 'pd-task--editing',
    drag.draggedId === task.id && 'pd-task--dragging',
    hint && `pd-task--drop-${hint}`,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={classes}
      role="treeitem"
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-checked={task.checked}
      style={{ '--pd-depth': depth } as CSSProperties}
    >
      <div ref={headRef} className="pd-task__head" onDragOver={onDragOver} onDrop={(e) => e.preventDefault()}>
        <span
          className="pd-task__grip"
          draggable
          title="Drag to move"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', task.title);
            if (headRef.current) event.dataTransfer.setDragImage(headRef.current, 24, 14);
            drag.start(task.id);
          }}
          onDragEnd={(event) => drag.end(event.dataTransfer.dropEffect !== 'none')}
        >
          <Icon name="grip" size={14} strokeWidth={2.2} />
        </span>

        <button
          type="button"
          className={`pd-task__chevron${hasChildren ? '' : ' pd-task__chevron--empty'}`}
          aria-label={collapsed ? 'Expand subtasks' : 'Collapse subtasks'}
          tabIndex={-1}
          disabled={!hasChildren}
          onClick={() => editor.toggleCollapsed(task.id)}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} strokeWidth={1.8} />
        </button>

        <button
          type="button"
          role="checkbox"
          aria-checked={task.checked}
          aria-label={task.checked ? 'Mark as not done' : 'Mark as done'}
          className={`pd-checkbox${task.checked ? ' pd-checkbox--checked' : ''}`}
          onClick={() => void editor.toggle(task.id)}
        >
          <Icon name="check" size={12} strokeWidth={2.2} />
        </button>

        <div className="pd-task__title">
          {editing ? (
            <input
              ref={inputRef}
              className="pd-task__input"
              value={task.title}
              placeholder="Task name"
              aria-label="Task name"
              spellCheck
              onChange={(event) => editor.rename(task.id, event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => editor.setFocusId((current) => (current === task.id ? null : current))}
            />
          ) : (
            <div
              className="pd-task__text"
              role="textbox"
              tabIndex={0}
              aria-label="Task name"
              onClick={() => editor.setFocusId(task.id)}
              onFocus={() => editor.setFocusId(task.id)}
            >
              {task.title ? (
                <Markdown source={task.title} inline onOpenLink={onOpenLink} />
              ) : (
                <span className="pd-task__placeholder">Untitled task</span>
              )}
            </div>
          )}
        </div>

        {total > 0 && (
          <span
            className={`pd-task__count${done === total ? ' pd-task__count--complete' : ''}`}
            title={`${done} of ${total} subtasks done`}
          >
            {done}/{total}
          </span>
        )}

        <div className="pd-task__actions">
          {!task.body && (
            <button
              type="button"
              className="pd-icon-button pd-task__action"
              title="Add notes (Shift+Enter)"
              aria-label="Add notes"
              onClick={() => setEditingBody(true)}
            >
              <Icon name="edit" size={14} />
            </button>
          )}
          <button
            type="button"
            className="pd-icon-button pd-task__action"
            title="Add subtask"
            aria-label="Add subtask"
            onClick={() => editor.addChild(task.id)}
          >
            <Icon name="plus" size={14} />
          </button>
          <Menu
            label="Task actions"
            triggerClassName="pd-icon-button pd-task__action"
            items={[
              { label: 'Add subtask', icon: 'plus', onSelect: () => editor.addChild(task.id) },
              { label: task.body ? 'Edit notes' : 'Add notes', icon: 'edit', hint: '⇧⏎', onSelect: () => setEditingBody(true) },
              { label: 'Focus on this task', icon: 'focus', onSelect: () => editor.setZoomId(task.id) },
              { label: 'Move up', icon: 'arrowUp', hint: 'Alt ↑', onSelect: () => editor.moveBy(task.id, -1), separated: true },
              { label: 'Move down', icon: 'arrowDown', hint: 'Alt ↓', onSelect: () => editor.moveBy(task.id, 1) },
              { label: 'Duplicate', icon: 'copy', onSelect: () => editor.duplicate(task.id), separated: true },
              { label: 'Copy as Markdown', icon: 'file', onSelect: copyAsMarkdown },
              { label: 'Delete', icon: 'trash', danger: true, onSelect: () => void editor.remove(task.id), separated: true },
            ]}
          />
        </div>
      </div>

      {(task.body || editingBody) && (
        <BodyEditor
          className="pd-task__body"
          value={task.body}
          placeholder="Write notes in Markdown…"
          startEditing={editingBody}
          onChange={(body) => editor.setBody(task.id, body)}
          onDone={() => setEditingBody(false)}
          onOpenLink={onOpenLink}
        />
      )}

      {hasChildren && !collapsed && (
        <ul className="pd-task__children" role="group">
          {task.children.map((child) =>
            hideCompleted && child.checked ? null : (
              <TaskRow
                key={child.id}
                task={child}
                depth={depth + 1}
                editor={editor}
                hideCompleted={hideCompleted}
                onOpenLink={onOpenLink}
              />
            ),
          )}
        </ul>
      )}
    </li>
  );
}
