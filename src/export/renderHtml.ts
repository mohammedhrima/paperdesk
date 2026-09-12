import type { ExportConfig } from '../config.js';
import type { NoteDoc, TaskNode } from '../core/model.js';
import { progressOf, subtreeProgress } from '../core/tree.js';
import { escapeHtml, renderInlineMarkdown, renderMarkdown } from './markdownToHtml.js';

/**
 * Renders notes into a self-contained HTML document.
 *
 * The same output feeds the preview panel and the PDF printer, which is why the
 * stylesheet is inlined rather than linked: the file has to stand on its own
 * once it leaves the extension.
 */

export interface RenderOptions {
  readonly config: ExportConfig;
  /** Contents of `theme.css`, read from disk by the caller. */
  readonly stylesheet: string;
  /** Heading for multi-note exports. A single note uses its own title instead. */
  readonly documentTitle: string;
  /** Extra markup for `<head>`, used by the preview to add its own CSP. */
  readonly headExtras?: string;
}

export function renderNotesHtml(notes: readonly NoteDoc[], options: RenderOptions): string {
  const { config, stylesheet, documentTitle } = options;
  const title = notes.length === 1 ? (notes[0]?.title ?? documentTitle) : documentTitle;

  const body =
    notes.length === 0
      ? '<p class="pd-empty">There is nothing to export yet.</p>'
      : notes.map((note) => renderNote(note, config)).join('\n');

  return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${options.headExtras ?? ''}
    <title>${escapeHtml(title)}</title>
    <style>
${stylesheet}
    </style>
    <style>
      /* Page geometry comes from settings, so it cannot live in the stylesheet. */
      @page { size: ${config.pageFormat}; margin: ${config.margin}; }
      :root { --pd-accent: ${config.accentColor}; }
    </style>
  </head>
  <body>
    <div class="pd-document">
${body}
    </div>
  </body>
</html>`;
}

function renderNote(note: NoteDoc, config: ExportConfig): string {
  const tasks = config.includeCompleted ? note.tasks : note.tasks.filter((task) => !task.checked);
  const progress = progressOf(note.tasks);

  const parts = [
    '<section class="pd-note">',
    '  <header class="pd-header">',
    `    <h1 class="pd-title">${escapeHtml(note.title)}</h1>`,
    renderMeta(note, progress.total),
    progress.total > 0 ? renderProgress(progress.done, progress.total) : '',
    '  </header>',
  ];

  if (note.intro.trim()) {
    parts.push(`  <div class="pd-prose">${renderMarkdown(note.intro)}</div>`);
  }

  if (tasks.length > 0) {
    parts.push(`  <ul class="pd-tasks">${tasks.map((t) => renderTask(t, config)).join('')}</ul>`);
  } else if (!note.intro.trim()) {
    parts.push('  <p class="pd-empty">No tasks yet.</p>');
  }

  if (note.trailing.trim()) {
    parts.push(`  <div class="pd-prose">${renderMarkdown(note.trailing)}</div>`);
  }

  parts.push('</section>');
  return parts.filter(Boolean).join('\n');
}

function renderMeta(note: NoteDoc, taskCount: number): string {
  const items = [formatDate(note.updated), taskCount > 0 ? `${taskCount} tasks` : '']
    .filter(Boolean)
    .map((text, index) =>
      index === 0
        ? `<span>${escapeHtml(text)}</span>`
        : `<span class="pd-meta__dot">${escapeHtml(text)}</span>`,
    );

  return items.length > 0 ? `    <div class="pd-meta">${items.join('')}</div>` : '';
}

function renderProgress(done: number, total: number): string {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return [
    '    <div class="pd-progress">',
    '      <div class="pd-progress__track">',
    `        <div class="pd-progress__fill" style="width: ${percent}%"></div>`,
    '      </div>',
    `      <div class="pd-progress__label">${done} of ${total} done</div>`,
    '    </div>',
  ].join('\n');
}

function renderTask(task: TaskNode, config: ExportConfig): string {
  const children = config.includeCompleted
    ? task.children
    : task.children.filter((child) => !child.checked);

  const { done, total } = subtreeProgress(task);
  const classes = ['pd-task', task.checked ? 'pd-task--done' : ''].filter(Boolean).join(' ');

  const parts = [
    `<li class="${classes}">`,
    '  <div class="pd-task__row">',
    `    <span class="pd-check${task.checked ? ' pd-check--done' : ''}"></span>`,
    `    <span class="pd-task__title">${renderInlineMarkdown(task.title)}</span>`,
    total > 0 ? `    <span class="pd-task__count">${done}/${total}</span>` : '',
    '  </div>',
  ];

  if (task.body.trim()) {
    parts.push(`  <div class="pd-task__body pd-prose">${renderMarkdown(task.body)}</div>`);
  }

  if (children.length > 0) {
    parts.push(
      `  <ul class="pd-task__children">${children.map((c) => renderTask(c, config)).join('')}</ul>`,
    );
  }

  parts.push('</li>');
  return parts.filter(Boolean).join('\n');
}

/** Formats a stored ISO timestamp, falling back to the raw value if unparseable. */
function formatDate(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
