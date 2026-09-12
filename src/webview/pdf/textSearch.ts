import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextContent } from 'pdfjs-dist/types/src/display/api';

/**
 * Full-text search over a PDF's text layer.
 *
 * A page's text arrives as a list of runs. They are joined into one searchable
 * string while remembering where each run starts, so a match — which may span
 * several runs — can be mapped back onto the exact spans the text layer drew.
 */

export interface PageText {
  /** Lower-cased, joined text of the page. */
  readonly haystack: string;
  /** Offset in `haystack` where each text run begins. */
  readonly offsets: readonly number[];
  /** The raw text of each run, in text-layer order. */
  readonly runs: readonly string[];
}

export interface TextRange {
  readonly start: number;
  readonly end: number;
}

export interface SearchMatch extends TextRange {
  readonly page: number;
}

const HIT_CLASS = 'pd-hit';
const CURRENT_HIT_CLASS = 'pd-hit--current';

interface TextItemLike {
  readonly str?: string;
  readonly hasEOL?: boolean;
}

/** Extracts a page's searchable text. */
export async function extractPageText(page: PDFPageProxy): Promise<PageText> {
  return pageTextFrom(await page.getTextContent());
}

/** Builds searchable text from content, in the same run order the text layer renders it. */
export function pageTextFrom(content: TextContent): PageText {
  const runs: string[] = [];
  const offsets: number[] = [];
  let haystack = '';

  for (const item of content.items as TextItemLike[]) {
    // Marked-content markers carry no text and are not rendered as spans.
    if (typeof item.str !== 'string') continue;
    offsets.push(haystack.length);
    runs.push(item.str);
    haystack += item.str.toLocaleLowerCase();
    // A line break becomes a space so phrases wrapping across lines still match.
    if (item.hasEOL) haystack += ' ';
  }

  return { haystack, offsets, runs };
}

/** Every non-overlapping occurrence of `query` in a page. */
export function findInPage(text: PageText, query: string): TextRange[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];

  const ranges: TextRange[] = [];
  for (let index = text.haystack.indexOf(needle); index !== -1; ) {
    ranges.push({ start: index, end: index + needle.length });
    index = text.haystack.indexOf(needle, index + needle.length);
  }
  return ranges;
}

/**
 * Paints `ranges` onto a rendered text layer by splitting the affected spans
 * around `<mark>` elements. Any previous highlighting is removed first, so the
 * call is idempotent.
 */
export function highlightTextLayer(
  spans: readonly HTMLElement[],
  text: PageText,
  ranges: readonly TextRange[],
  currentIndex: number,
): HTMLElement | null {
  let currentMark: HTMLElement | null = null;

  spans.forEach((span, runIndex) => {
    const run = text.runs[runIndex] ?? '';
    const runStart = text.offsets[runIndex] ?? 0;
    const runEnd = runStart + run.length;

    const pieces = ranges
      .map((range, index) => ({ ...range, index }))
      .filter((range) => range.start < runEnd && range.end > runStart);

    if (pieces.length === 0) {
      if (span.childElementCount > 0) span.textContent = run;
      return;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;
    for (const piece of pieces) {
      const from = Math.max(0, piece.start - runStart);
      const to = Math.min(run.length, piece.end - runStart);
      if (from > cursor) fragment.append(run.slice(cursor, from));

      const mark = document.createElement('mark');
      mark.className = piece.index === currentIndex ? `${HIT_CLASS} ${CURRENT_HIT_CLASS}` : HIT_CLASS;
      mark.textContent = run.slice(from, to);
      fragment.append(mark);
      if (piece.index === currentIndex) currentMark ??= mark;
      cursor = to;
    }
    if (cursor < run.length) fragment.append(run.slice(cursor));

    span.replaceChildren(fragment);
  });

  return currentMark;
}
