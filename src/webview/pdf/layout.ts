/**
 * Geometry and timing of the PDF viewer.
 *
 * The page stack is laid out by CSS but scrolled by arithmetic — restoring a
 * position, keeping your place across a zoom, jumping to a search hit. Both
 * sides read these numbers, so they agree by construction. User-tunable values
 * (zoom limits, render window, filters) live in settings instead.
 */

/** Vertical space between pages, in CSS pixels. */
export const PAGE_GAP = 16;

/** Space around the page stack, in CSS pixels. */
export const STACK_PADDING_X = 24;
export const STACK_PADDING_Y = 20;

/**
 * Where on screen the "current page" is read from, as a fraction of the
 * viewport height. A third of the way down matches where the eye rests while
 * reading, so the page counter flips when a page is actually being read.
 */
export const READING_LINE = 1 / 3;

/** Idle time before the reading position is reported to the host. */
export const POSITION_REPORT_DELAY_MS = 250;

/** Idle typing time before a search runs. */
export const SEARCH_DEBOUNCE_MS = 200;

/** How long the floating page indicator stays visible after scrolling stops. */
export const PAGE_INDICATOR_MS = 900;

/** Zoom levels offered in the zoom menu, filtered by the configured limits. */
export const ZOOM_PRESETS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
