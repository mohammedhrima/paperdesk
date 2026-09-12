import type { NoteDoc, TaskNode } from '../model.js';
import { renderFrontmatter } from './frontmatter.js';

/** Columns a nested level adds, matching the width of the `- ` list marker. */
const INDENT_WIDTH = 2;

export interface SerializeOptions {
  /** Drop completed tasks, and any subtree beneath them. Used by exports. */
  readonly includeCompleted?: boolean;
  /** Emit the YAML frontmatter block. */
  readonly includeFrontmatter?: boolean;
}

/**
 * Renders a {@link NoteDoc} back to Markdown.
 *
 * Only the task scaffolding — the `- [ ]` markers and their indentation — is
 * generated. Titles, bodies and prose are written back exactly as they were
 * read, so re-saving a note the user has hand-formatted never reflows it.
 */
export function serializeNote(doc: NoteDoc, options: SerializeOptions = {}): string {
  const { includeCompleted = true, includeFrontmatter = true } = options;

  const sections: string[] = [];

  if (includeFrontmatter) {
    const frontmatter = renderFrontmatter({
      title: doc.title,
      created: doc.created || undefined,
      updated: doc.updated || undefined,
      ...doc.extraFrontmatter,
    });
    if (frontmatter) sections.push(frontmatter.trimEnd());
  }

  if (doc.intro.trim()) sections.push(doc.intro.trim());

  const tasks = includeCompleted ? doc.tasks : doc.tasks.filter((task) => !task.checked);
  const rendered = tasks.map((task) => renderTask(task, 0, includeCompleted)).join('\n');
  if (rendered) sections.push(rendered.trimEnd());

  if (doc.trailing.trim()) sections.push(doc.trailing.trim());

  return sections.length === 0 ? '' : `${sections.join('\n\n')}\n`;
}

function renderTask(task: TaskNode, depth: number, includeCompleted: boolean): string {
  const indent = ' '.repeat(depth * INDENT_WIDTH);
  const marker = `${indent}- [${task.checked ? 'x' : ' '}]`;
  const title = task.title.trim();
  const lines = [title ? `${marker} ${title}` : marker];

  const body = task.body.trim();
  if (body) {
    lines.push('', indentBlock(body, indent + ' '.repeat(INDENT_WIDTH)));
  }

  const children = includeCompleted ? task.children : task.children.filter((c) => !c.checked);
  if (children.length > 0) {
    // A task with a body needs a blank line before its subtasks, or Markdown
    // would fold the list into the preceding paragraph.
    if (body) lines.push('');
    for (const child of children) {
      lines.push(renderTask(child, depth + 1, includeCompleted));
    }
  }

  return lines.join('\n');
}

/** Indents every non-blank line, leaving blank lines free of trailing spaces. */
function indentBlock(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${indent}${line}`))
    .join('\n');
}
