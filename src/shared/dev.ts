/**
 * Settings shared between the Vite dev server and the extension host that points
 * webviews at it. Defined once here so the two can never drift apart.
 */

/** Port the Vite dev server listens on while running `npm run dev`. */
export const DEV_SERVER_PORT = 5273;

/** Origin the webview loads modules from in development. */
export const DEV_SERVER_ORIGIN = `http://localhost:${DEV_SERVER_PORT}`;

/** Websocket origin Vite uses to push hot updates. */
export const DEV_SERVER_WS_ORIGIN = `ws://localhost:${DEV_SERVER_PORT}`;

/**
 * Webview entry points, keyed by surface. The key is the bundle name produced by
 * `vite build`; the value is the source module served in development.
 */
export const WEBVIEW_ENTRIES = {
  pdf: 'pdf/main.tsx',
  notes: 'notes/main.tsx',
} as const;

export type WebviewEntry = keyof typeof WEBVIEW_ENTRIES;
