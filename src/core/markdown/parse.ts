import type { List, ListItem, Root, RootContent } from 'mdast';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import { createTask, pathToId, type NoteDoc, type TaskNode, type TaskPath } from '../model.js';
import { splitFrontmatter } from './frontmatter.js';

/**
 * Turns a Markdown file into a {@link NoteDoc}.
 *
 * Task structure is read from the syntax tree, but every span of prose — the
 * intro, each task title, each task body, and anything after the list — is
 * sliced verbatim out of the original source. Nothing the user wrote is ever
 * re-rendered from the tree, so formatting survives a round trip exactly.
 */
export function parseNote(fileName: string, source: string, fallbackTitle: string): NoteDoc {
  const { data, body } = splitFrontmatter(source);
  const tree = fromMarkdown(body, {
    extensions: [gfm()],
    mdastExtensions: gfmFromMarkdown(),
  });

  const taskList = findTaskList(body, tree);
  const { title, created, updated, ...extraFrontmatter } = data;

  return {
    fileName,
    title: asString(title) ?? fallbackTitle,
    created: asString(created) ?? '',
    updated: asString(updated) ?? '',
    extraFrontmatter,
    intro: sliceBefore(body, taskList),
    tasks: taskList ? taskList.children.map((item, index) => toTask(body, item, [index])) : [],
    trailing: sliceAfter(body, taskList),
  };
}

/**
 * The first top-level list containing checkboxes. Plain bullet lists in the
 * intro are left as prose, so a note can open with an unchecked outline without
 * it being mistaken for the task tree.
 */
function findTaskList(source: string, tree: Root): List | undefined {
  return tree.children.find(
    (node): node is List =>
      node.type === 'list' && node.children.some((item) => checkboxOf(source, item) !== undefined),
  );
}

/** A bare checkbox with no text after it, e.g. `- [ ]`. */
const EMPTY_CHECKBOX = /^\[([ xX])\]$/;

/**
 * The checked state of a list item, or `undefined` if it is not a task.
 *
 * GFM only recognises a checkbox followed by text, so `- [ ]` on its own parses
 * as a plain item reading "[ ]". That is exactly how an empty task is saved, so
 * it is recognised here too — otherwise a freshly added task would come back
 * from disk titled "[ ]", or turn a whole task list into prose.
 */
function checkboxOf(source: string, item: ListItem): boolean | undefined {
  if (item.checked === true || item.checked === false) return item.checked;
  const first = item.children[0];
  const bare = first?.type === 'paragraph' ? slice(source, first).trim().match(EMPTY_CHECKBOX) : null;
  return bare ? bare[1] !== ' ' : undefined;
}

function toTask(source: string, item: ListItem, path: TaskPath): TaskNode {
  const [titleNode, ...rest] = item.children;
  const childList = rest.at(-1)?.type === 'list' ? (rest.pop() as List) : undefined;
  const checked = checkboxOf(source, item);
  const isBareCheckbox = item.checked !== true && item.checked !== false && checked !== undefined;

  return createTask({
    id: pathToId(path),
    checked: checked === true,
    // A bare checkbox's only paragraph is the checkbox itself, not a title.
    title: titleNode && !isBareCheckbox ? slice(source, titleNode) : '',
    body: dedent(sliceRange(source, rest), contentIndentOf(item)),
    children: childList
      ? childList.children.map((child, index) => toTask(source, child, [...path, index]))
      : [],
  });
}

/**
 * Columns of indentation the Markdown writer must restore in front of a task's
 * continuation blocks: the item's own indentation plus the width of `- `.
 */
function contentIndentOf(item: ListItem): number {
  return (item.position?.start.column ?? 1) - 1 + 2;
}

function slice(source: string, node: RootContent | List): string {
  const { start, end } = node.position ?? {};
  if (start?.offset === undefined || end?.offset === undefined) return '';
  return source.slice(start.offset, end.offset);
}

/** Verbatim source spanning a run of sibling nodes, blank lines included. */
function sliceRange(source: string, nodes: readonly RootContent[]): string {
  const first = nodes.at(0)?.position?.start.offset;
  const last = nodes.at(-1)?.position?.end.offset;
  if (first === undefined || last === undefined) return '';
  return source.slice(first, last);
}

function sliceBefore(source: string, list: List | undefined): string {
  const offset = list?.position?.start.offset;
  return trimBlankEdges(offset === undefined ? source : source.slice(0, offset));
}

function sliceAfter(source: string, list: List | undefined): string {
  const offset = list?.position?.end.offset;
  return offset === undefined ? '' : trimBlankEdges(source.slice(offset));
}

/**
 * Removes `indent` columns from every line but the first. The first line's
 * indentation was already consumed by the slice offset that produced the text.
 */
function dedent(text: string, indent: number): string {
  if (text.length === 0 || indent <= 0) return text;
  const pattern = new RegExp(`^[ \\t]{0,${indent}}`);
  return text
    .split('\n')
    .map((line, index) => (index === 0 ? line : line.replace(pattern, '')))
    .join('\n');
}

function trimBlankEdges(text: string): string {
  return text.replace(/^\s*\n/, '').trimEnd();
}

function asString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return undefined;
}
