import { createTask, pathToId, type Progress, type TaskNode, type TaskPath } from './model.js';

/**
 * Immutable operations on a task tree.
 *
 * Every function returns a new tree and leaves its input untouched, which is
 * what lets the UI render optimistically and the store diff cheaply. Because
 * task ids are derived from position, each structural change ends with a
 * reindex so ids stay in step with the shape of the tree.
 */

export type Tasks = readonly TaskNode[];

/** Rewrites every id to match its position. Call after any structural change. */
export function reindex(tasks: Tasks, prefix: TaskPath = []): TaskNode[] {
  return tasks.map((task, index) => {
    const path = [...prefix, index];
    return { ...task, id: pathToId(path), children: reindex(task.children, path) };
  });
}

/** The task at `path`, or `undefined` if the path does not resolve. */
export function getTask(tasks: Tasks, path: TaskPath): TaskNode | undefined {
  let current: TaskNode | undefined;
  let level: Tasks = tasks;

  for (const index of path) {
    current = level[index];
    if (!current) return undefined;
    level = current.children;
  }
  return current;
}

/**
 * Replaces the task at `path` with the result of `updater`. Returning
 * `undefined` from `updater` removes the task.
 */
export function updateTask(
  tasks: Tasks,
  path: TaskPath,
  updater: (task: TaskNode) => TaskNode | undefined,
): TaskNode[] {
  const [index, ...rest] = path;
  if (index === undefined) return [...tasks];

  const target = tasks[index];
  if (!target) return [...tasks];

  const replacement =
    rest.length === 0 ? updater(target) : { ...target, children: updateTask(target.children, rest, updater) };

  const next = [...tasks];
  if (replacement === undefined) next.splice(index, 1);
  else next[index] = replacement;
  return reindex(next);
}

/** Removes the task at `path`, returning the new tree and the removed node. */
export function removeTask(tasks: Tasks, path: TaskPath): { tasks: TaskNode[]; removed?: TaskNode } {
  const removed = getTask(tasks, path);
  if (!removed) return { tasks: [...tasks] };
  return { tasks: updateTask(tasks, path, () => undefined), removed };
}

/**
 * Inserts `task` at `path`, shifting any existing sibling down. A path of
 * `[1, 0]` inserts as the first subtask of the second root task.
 */
export function insertTask(tasks: Tasks, path: TaskPath, task: TaskNode): TaskNode[] {
  const parentPath = path.slice(0, -1);
  const index = path.at(-1) ?? 0;

  if (parentPath.length === 0) {
    const next = [...tasks];
    next.splice(clamp(index, 0, next.length), 0, task);
    return reindex(next);
  }

  return updateTask(tasks, parentPath, (parent) => {
    const children = [...parent.children];
    children.splice(clamp(index, 0, children.length), 0, task);
    return { ...parent, children };
  });
}

/** Adds an empty sibling directly below `path` and returns where it landed. */
export function addSiblingAfter(
  tasks: Tasks,
  path: TaskPath,
  title = '',
): { tasks: TaskNode[]; path: TaskPath } {
  const target: TaskPath = [...path.slice(0, -1), (path.at(-1) ?? -1) + 1];
  return { tasks: insertTask(tasks, target, createTask({ title })), path: target };
}

/** Appends an empty task to the end of `parentPath`'s children, or to the root. */
export function appendTask(
  tasks: Tasks,
  parentPath: TaskPath | undefined,
  title = '',
): { tasks: TaskNode[]; path: TaskPath } {
  const siblings = parentPath ? (getTask(tasks, parentPath)?.children ?? []) : tasks;
  const target: TaskPath = [...(parentPath ?? []), siblings.length];
  return { tasks: insertTask(tasks, target, createTask({ title })), path: target };
}

/**
 * Moves a task to `to`, expressed as an insertion point in the tree *before*
 * the move. Moving a task into its own subtree is refused, since that would
 * detach the branch from the document.
 */
export function moveTask(tasks: Tasks, from: TaskPath, to: TaskPath): TaskNode[] {
  if (isAncestorOrSelf(from, to)) return [...tasks];

  const { tasks: without, removed } = removeTask(tasks, from);
  if (!removed) return [...tasks];

  return insertTask(without, adjustForRemoval(from, to), removed);
}

/** Makes a task the last child of its previous sibling. */
export function indentTask(tasks: Tasks, path: TaskPath): { tasks: TaskNode[]; path: TaskPath } {
  const index = path.at(-1);
  if (index === undefined || index === 0) return { tasks: [...tasks], path };

  const parentPath = path.slice(0, -1);
  const siblings = parentPath.length === 0 ? tasks : (getTask(tasks, parentPath)?.children ?? []);
  const previous = siblings[index - 1];
  if (!previous) return { tasks: [...tasks], path };

  const target: TaskPath = [...parentPath, index - 1, previous.children.length];
  return { tasks: moveTask(tasks, path, target), path: target };
}

/** Lifts a task to sit directly after its former parent. */
export function outdentTask(tasks: Tasks, path: TaskPath): { tasks: TaskNode[]; path: TaskPath } {
  if (path.length < 2) return { tasks: [...tasks], path };

  const parentPath = path.slice(0, -1);
  const target: TaskPath = [...parentPath.slice(0, -1), (parentPath.at(-1) ?? 0) + 1];
  return { tasks: moveTask(tasks, path, target), path: target };
}

/**
 * Sets the checked state of a task.
 *
 * With `cascade`, the whole subtree follows the parent. Either way, unchecking
 * a task unchecks its ancestors — a parent cannot be done while something
 * beneath it is not.
 */
export function setChecked(
  tasks: Tasks,
  path: TaskPath,
  checked: boolean,
  cascade: boolean,
): TaskNode[] {
  const updated = updateTask(tasks, path, (task) => ({
    ...task,
    checked,
    children: cascade ? setSubtreeChecked(task.children, checked) : task.children,
  }));

  return checked ? updated : uncheckAncestors(updated, path);
}

function setSubtreeChecked(tasks: Tasks, checked: boolean): TaskNode[] {
  return tasks.map((task) => ({
    ...task,
    checked,
    children: setSubtreeChecked(task.children, checked),
  }));
}

function uncheckAncestors(tasks: Tasks, path: TaskPath): TaskNode[] {
  let result = [...tasks];
  for (let depth = path.length - 1; depth > 0; depth -= 1) {
    result = updateTask(result, path.slice(0, depth), (task) => ({ ...task, checked: false }));
  }
  return result;
}

/** Every task in the tree, depth first, paired with its path. */
export function flatten(tasks: Tasks, prefix: TaskPath = []): { task: TaskNode; path: TaskPath }[] {
  return tasks.flatMap((task, index) => {
    const path = [...prefix, index];
    return [{ task, path }, ...flatten(task.children, path)];
  });
}

/** Completion across a whole forest, counting every task at every depth. */
export function progressOf(tasks: Tasks): Progress {
  const all = flatten(tasks);
  return { done: all.filter(({ task }) => task.checked).length, total: all.length };
}

/** Completion across a task's descendants, not counting the task itself. */
export function subtreeProgress(task: TaskNode): Progress {
  return progressOf(task.children);
}

/** True when `to` is inside `from`'s subtree, or is `from` itself. */
function isAncestorOrSelf(from: TaskPath, to: TaskPath): boolean {
  return from.every((segment, index) => to[index] === segment);
}

/**
 * Rewrites an insertion path so it still points at the intended slot after the
 * moved task has been spliced out of the tree.
 */
function adjustForRemoval(from: TaskPath, to: TaskPath): TaskPath {
  const parentDepth = from.length - 1;
  const sameParent = from.slice(0, parentDepth).every((segment, i) => to[i] === segment);
  const removedIndex = from.at(-1) ?? 0;
  const targetIndex = to[parentDepth];

  if (!sameParent || to.length !== from.length || targetIndex === undefined) return to;
  if (targetIndex <= removedIndex) return to;

  return [...to.slice(0, parentDepth), targetIndex - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
