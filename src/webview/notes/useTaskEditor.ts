import { useCallback, useMemo, useState } from 'react';
import { createTask, idToPath, type TaskNode, type TaskPath } from '../../core/model';
import {
  addSiblingAfter,
  appendTask,
  getTask,
  indentTask,
  insertTask,
  moveTask,
  outdentTask,
  removeTask,
  setChecked,
  updateTask,
} from '../../core/tree';
import type { NotesSettings } from '../protocol';
import type { ConfirmRequest } from '../ui/ConfirmDialog';
import { readViewState, writeViewState } from '../ui/host';

/** Where a dragged task lands relative to the row it is dropped on. */
export type DropPosition = 'before' | 'inside' | 'after';

interface TaskEditorOptions {
  readonly fileName: string;
  readonly tasks: readonly TaskNode[];
  readonly settings: NotesSettings;
  readonly hideCompleted: boolean;
  readonly setTasks: (update: (tasks: readonly TaskNode[]) => readonly TaskNode[]) => void;
  readonly confirm: (request: ConfirmRequest) => Promise<boolean>;
}

interface ViewMemory {
  /** Collapsed task ids, per note file. */
  readonly collapsed: Record<string, readonly string[]>;
}

/**
 * Every interaction the task tree supports, expressed as intent.
 *
 * Components call `toggle`, `indent`, `remove` and so on; this hook turns those
 * into tree operations, decides where keyboard focus goes next, and remembers
 * which branches are collapsed. Keeping that logic here leaves the row component
 * responsible only for how a task looks.
 */
export function useTaskEditor(options: TaskEditorOptions) {
  const { fileName, tasks, settings, hideCompleted, setTasks, confirm } = options;

  const [focusId, setFocusId] = useState<string | null>(null);
  /** The task whose subtree fills the view, when the user has focused on one. */
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(readViewState<ViewMemory>({ collapsed: {} }).collapsed[fileName] ?? []),
  );

  const persistCollapsed = useCallback(
    (next: ReadonlySet<string>) => {
      setCollapsed(next);
      const memory = readViewState<ViewMemory>({ collapsed: {} });
      writeViewState<ViewMemory>({ collapsed: { ...memory.collapsed, [fileName]: [...next] } });
    },
    [fileName],
  );

  /** Task ids in on-screen order, used for arrow-key navigation. */
  const visibleIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: readonly TaskNode[]) => {
      for (const node of nodes) {
        if (hideCompleted && node.checked) continue;
        ids.push(node.id);
        if (!collapsed.has(node.id)) walk(node.children);
      }
    };
    // While focused on one task, navigation stays inside its subtree.
    const zoomed = zoomId ? getTask(tasks, idToPath(zoomId)) : undefined;
    walk(zoomed ? zoomed.children : tasks);
    return ids;
  }, [tasks, collapsed, hideCompleted, zoomId]);

  const focusPath = (path: TaskPath) => setFocusId(path.join('.'));

  const toggle = async (id: string) => {
    const path = idToPath(id);
    const task = getTask(tasks, path);
    if (!task) return;

    const checked = !task.checked;
    const openChildren = task.children.length > 0;
    let cascade = settings.cascadeCompletion === 'always';

    if (checked && openChildren && settings.cascadeCompletion === 'ask') {
      cascade = await confirm({
        title: 'Complete subtasks too?',
        message: `“${plain(task.title)}” has ${task.children.length} subtask(s).`,
        confirmLabel: 'Complete all',
        cancelLabel: 'Only this task',
      });
    }

    setTasks((current) => setChecked(current, path, checked, cascade));
  };

  const rename = (id: string, title: string) =>
    setTasks((current) => updateTask(current, idToPath(id), (task) => ({ ...task, title })));

  const setBody = (id: string, body: string) =>
    setTasks((current) => updateTask(current, idToPath(id), (task) => ({ ...task, body })));

  const addAfter = (id: string) => {
    let target: TaskPath = [];
    setTasks((current) => {
      const result = addSiblingAfter(current, idToPath(id));
      target = result.path;
      return result.tasks;
    });
    focusPath(target);
  };

  const addChild = (id: string) => {
    let target: TaskPath = [];
    if (collapsed.has(id)) persistCollapsed(without(collapsed, id));
    setTasks((current) => {
      const result = appendTask(current, idToPath(id));
      target = result.path;
      return result.tasks;
    });
    focusPath(target);
  };

  /** Adds a task at the end of `parentId`'s children, or of the root. */
  const addAtEnd = (parentId: string | null, title = '') => {
    let target: TaskPath = [];
    setTasks((current) => {
      const result = appendTask(current, parentId === null ? undefined : idToPath(parentId), title);
      target = result.path;
      return result.tasks;
    });
    if (!title) focusPath(target);
  };

  const indent = (id: string) => {
    let target: TaskPath = idToPath(id);
    const parentIndex = target.at(-1);
    // Indenting makes the task the last child of its previous sibling, which
    // must be expanded or the task would vanish from view mid-edit.
    if (parentIndex !== undefined && parentIndex > 0) {
      const previousId = [...target.slice(0, -1), parentIndex - 1].join('.');
      if (collapsed.has(previousId)) persistCollapsed(without(collapsed, previousId));
    }
    setTasks((current) => {
      const result = indentTask(current, idToPath(id));
      target = result.path;
      return result.tasks;
    });
    focusPath(target);
  };

  const outdent = (id: string) => {
    let target: TaskPath = idToPath(id);
    setTasks((current) => {
      const result = outdentTask(current, idToPath(id));
      target = result.path;
      return result.tasks;
    });
    focusPath(target);
  };

  const remove = async (id: string, { viaKeyboard = false } = {}) => {
    const task = getTask(tasks, idToPath(id));
    if (!task) return;

    if (task.children.length > 0 && settings.confirmBeforeDelete) {
      const accepted = await confirm({
        title: 'Delete this task?',
        message: `“${plain(task.title) || 'Untitled task'}” and its ${countDescendants(task)} subtask(s) will be removed.`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!accepted) return;
    }

    const index = visibleIds.indexOf(id);
    setTasks((current) => removeTask(current, idToPath(id)).tasks);

    if (viaKeyboard) {
      // Focus the row that was above; its id is unaffected by removing a later row.
      setFocusId(index > 0 ? (visibleIds[index - 1] ?? null) : null);
    }
  };

  const duplicate = (id: string) => {
    const path = idToPath(id);
    const task = getTask(tasks, path);
    if (!task) return;
    const target: TaskPath = [...path.slice(0, -1), (path.at(-1) ?? 0) + 1];
    setTasks((current) => insertTask(current, target, cloneTask(task)));
  };

  const moveBy = (id: string, offset: -1 | 1) => {
    const path = idToPath(id);
    const index = path.at(-1) ?? 0;
    const parent = path.slice(0, -1);
    const siblings = parent.length === 0 ? tasks : (getTask(tasks, parent)?.children ?? []);
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;

    // `moveTask` expects the insertion point before removal, so moving down
    // has to skip past the neighbour it is swapping with.
    const target = [...parent, offset === 1 ? nextIndex + 1 : nextIndex];
    setTasks((current) => moveTask(current, path, target));
    focusPath([...parent, nextIndex]);
  };

  const drop = (draggedId: string, targetId: string, position: DropPosition) => {
    if (draggedId === targetId) return;
    const from = idToPath(draggedId);
    const onto = idToPath(targetId);
    const target = getTask(tasks, onto);
    if (!target) return;

    const to: TaskPath =
      position === 'before'
        ? onto
        : position === 'inside'
          ? [...onto, target.children.length]
          : [...onto.slice(0, -1), (onto.at(-1) ?? 0) + 1];

    if (position === 'inside' && collapsed.has(targetId)) persistCollapsed(without(collapsed, targetId));
    setTasks((current) => moveTask(current, from, to));
  };

  const toggleCollapsed = (id: string) =>
    persistCollapsed(collapsed.has(id) ? without(collapsed, id) : new Set([...collapsed, id]));

  const setAllCollapsed = (value: boolean) => {
    if (!value) return persistCollapsed(new Set());
    const withChildren: string[] = [];
    const walk = (nodes: readonly TaskNode[]) =>
      nodes.forEach((node) => {
        if (node.children.length > 0) withChildren.push(node.id);
        walk(node.children);
      });
    walk(tasks);
    persistCollapsed(new Set(withChildren));
  };

  const focusNeighbour = (id: string, offset: -1 | 1) => {
    const index = visibleIds.indexOf(id);
    const next = visibleIds[index + offset];
    if (next) setFocusId(next);
  };

  return {
    focusId,
    setFocusId,
    zoomId,
    setZoomId,
    collapsed,
    toggle,
    rename,
    setBody,
    addAfter,
    addChild,
    addAtEnd,
    indent,
    outdent,
    remove,
    duplicate,
    moveBy,
    drop,
    toggleCollapsed,
    setAllCollapsed,
    focusNeighbour,
  };
}

export type TaskEditor = ReturnType<typeof useTaskEditor>;

function cloneTask(task: TaskNode): TaskNode {
  return createTask({ ...task, children: task.children.map(cloneTask) });
}

function countDescendants(task: TaskNode): number {
  return task.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function without(set: ReadonlySet<string>, value: string): Set<string> {
  const next = new Set(set);
  next.delete(value);
  return next;
}

/** Strips the most common inline Markdown so titles read cleanly in dialogs. */
function plain(markdown: string): string {
  return markdown.replace(/[*_`~]/g, '').trim();
}
