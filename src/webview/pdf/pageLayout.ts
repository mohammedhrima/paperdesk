import type { ReadingPosition } from '../protocol';
import { PAGE_GAP, STACK_PADDING_X, STACK_PADDING_Y } from './layout';
import { CSS_UNITS } from './pdfjs';

/** A page's size in PDF points, at scale 1. */
export interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** Where every page sits in the scrolling stack at one particular scale. */
export interface StackLayout {
  /** pdf.js viewport scale: zoom × CSS pixels per point. */
  readonly scale: number;
  readonly tops: readonly number[];
  readonly heights: readonly number[];
  readonly widths: readonly number[];
  readonly totalHeight: number;
}

/**
 * The zoom factor in effect. Fit modes are resolved against the visible area
 * using the largest page, so no page is ever cropped by "fit".
 */
export function resolveZoom(
  zoom: ReadingPosition['zoom'],
  sizes: readonly PageSize[],
  viewport: { readonly width: number; readonly height: number },
  limits: { readonly minZoom: number; readonly maxZoom: number },
): number {
  const widest = Math.max(...sizes.map((size) => size.width), 1);
  const tallest = Math.max(...sizes.map((size) => size.height), 1);

  const fitWidth = (viewport.width - 2 * STACK_PADDING_X) / (widest * CSS_UNITS);
  const fitPage = Math.min(fitWidth, (viewport.height - 2 * STACK_PADDING_Y) / (tallest * CSS_UNITS));

  const raw = zoom === 'fit-width' ? fitWidth : zoom === 'fit-page' ? fitPage : zoom;
  return clamp(Number.isFinite(raw) && raw > 0 ? raw : 1, limits.minZoom, limits.maxZoom);
}

export function buildLayout(sizes: readonly PageSize[], zoom: number): StackLayout {
  const scale = zoom * CSS_UNITS;
  const tops: number[] = [];
  const heights: number[] = [];
  const widths: number[] = [];
  let cursor = STACK_PADDING_Y;

  for (const size of sizes) {
    tops.push(cursor);
    heights.push(size.height * scale);
    widths.push(size.width * scale);
    cursor += size.height * scale + PAGE_GAP;
  }

  return { scale, tops, heights, widths, totalHeight: cursor - PAGE_GAP + STACK_PADDING_Y };
}

/** Index of the page under vertical offset `y`. */
export function pageIndexAt(layout: StackLayout, y: number): number {
  let low = 0;
  let high = layout.tops.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((layout.tops[mid] ?? 0) <= y) low = mid;
    else high = mid - 1;
  }
  return Math.max(low, 0);
}

/** The reading position at a scroll offset, independent of scale. */
export function positionAt(layout: StackLayout, scrollTop: number): { page: number; offsetRatio: number } {
  const index = pageIndexAt(layout, scrollTop);
  const top = layout.tops[index] ?? 0;
  const height = layout.heights[index] || 1;
  return { page: index + 1, offsetRatio: clamp((scrollTop - top) / height, 0, 1) };
}

/** The scroll offset that shows `page` at `offsetRatio`. */
export function scrollTopFor(layout: StackLayout, page: number, offsetRatio: number): number {
  const index = clamp(page - 1, 0, layout.tops.length - 1);
  const top = layout.tops[index] ?? 0;
  const height = layout.heights[index] ?? 0;
  // At the very top of a page, leave a sliver of gap visible so the page edge reads.
  return offsetRatio === 0 ? Math.max(top - PAGE_GAP / 2, 0) : top + offsetRatio * height;
}

/** Pages to render: those on screen, widened by `window` pages each way. */
export function renderRange(
  layout: StackLayout,
  scrollTop: number,
  viewportHeight: number,
  window: number,
): { first: number; last: number } {
  const count = layout.tops.length;
  if (count === 0) return { first: 0, last: -1 };
  const first = pageIndexAt(layout, scrollTop);
  const last = pageIndexAt(layout, scrollTop + viewportHeight);
  return { first: Math.max(first - window, 0), last: Math.min(last + window, count - 1) };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
