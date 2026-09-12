import { micromark, type Options } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';

/**
 * Markdown to HTML for exported and previewed documents.
 *
 * Uses the same GFM dialect the parser reads with, so what a note looks like in
 * the editor is what it looks like on the page.
 */

const options: Options = {
  extensions: [gfm()],
  htmlExtensions: [gfmHtml()],
};

/** Renders block-level Markdown: paragraphs, lists, code, tables. */
export function renderMarkdown(source: string): string {
  const trimmed = source.trim();
  return trimmed ? micromark(trimmed, options) : '';
}

/**
 * Renders Markdown known to be a single line — a task title — without the
 * paragraph wrapper that would otherwise break the checkbox row's layout.
 */
export function renderInlineMarkdown(source: string): string {
  const html = renderMarkdown(source).trim();
  const unwrapped = html.match(/^<p>([\s\S]*)<\/p>$/);
  return unwrapped?.[1] ?? html;
}

/** Escapes text destined for an HTML attribute or text node. */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
