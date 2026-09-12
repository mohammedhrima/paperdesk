import * as vscode from 'vscode';
import {
  DEV_SERVER_ORIGIN,
  DEV_SERVER_WS_ORIGIN,
  WEBVIEW_ENTRIES,
  type WebviewEntry,
} from '../shared/dev.js';
import { entryAssets } from './manifest.js';

/**
 * Builds the HTML shell a webview loads.
 *
 * In development the shell points at the Vite dev server, so editing a
 * component updates the running view without reloading the Extension Host. In
 * production it loads the built bundle through `asWebviewUri` under a strict
 * Content Security Policy. The React app itself is identical either way.
 */

export interface WebviewHtmlOptions {
  readonly webview: vscode.Webview;
  readonly extensionUri: vscode.Uri;
  readonly mode: vscode.ExtensionMode;
  readonly entry: WebviewEntry;
  readonly title: string;
}

/** Directory the built webview assets live in, and the only readable root. */
export function webviewDistUri(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'dist');
}

/**
 * Set by the "production build" launch configuration, to try the bundled
 * webviews under F5 without a dev server running.
 */
const FORCE_PRODUCTION_ENV = 'PAPERDESK_FORCE_PRODUCTION';

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const isDevelopment =
    options.mode === vscode.ExtensionMode.Development && process.env[FORCE_PRODUCTION_ENV] !== '1';
  return isDevelopment ? developmentHtml(options) : productionHtml(options);
}

function productionHtml({ webview, extensionUri, entry, title }: WebviewHtmlOptions): string {
  const nonce = createNonce();
  const distUri = vscode.Uri.joinPath(webviewDistUri(extensionUri), 'webview');
  // A base href lets the bundle's own relative imports — code-split chunks, the
  // pdf.js worker, fonts — resolve to webview URIs without any rewriting.
  const base = `${webview.asWebviewUri(distUri).toString()}/`;

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `font-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    `worker-src ${webview.cspSource} blob:`,
    `connect-src ${webview.cspSource} blob: data:`,
  ].join('; ');

  const assets = entryAssets(extensionUri, entry);

  return page({
    title,
    csp,
    base,
    head: assets.styles.map((file) => `<link rel="stylesheet" href="${file}">`).join('\n    '),
    body: `<script type="module" nonce="${nonce}" src="${assets.script}"></script>`,
  });
}

function developmentHtml({ webview, entry, title }: WebviewHtmlOptions): string {
  const moduleUrl = `${DEV_SERVER_ORIGIN}/${WEBVIEW_ENTRIES[entry]}`;

  // The dev server rewrites modules on the fly and pushes updates over a
  // websocket, so development needs a wider policy than production.
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} ${DEV_SERVER_ORIGIN} data: blob:`,
    `font-src ${webview.cspSource} ${DEV_SERVER_ORIGIN} data:`,
    `style-src ${webview.cspSource} ${DEV_SERVER_ORIGIN} 'unsafe-inline'`,
    `script-src ${DEV_SERVER_ORIGIN} 'unsafe-inline' 'unsafe-eval'`,
    `worker-src ${DEV_SERVER_ORIGIN} blob:`,
    // The webview's own resource origin serves pdf.js data files even in development.
    `connect-src ${webview.cspSource} ${DEV_SERVER_ORIGIN} ${DEV_SERVER_WS_ORIGIN} blob: data:`,
  ].join('; ');

  // React Fast Refresh needs its runtime installed before any component module
  // is evaluated; this is the preamble @vitejs/plugin-react normally injects.
  const preamble = `
    <script type="module">
      import RefreshRuntime from '${DEV_SERVER_ORIGIN}/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script>
    <script type="module" src="${DEV_SERVER_ORIGIN}/@vite/client"></script>`;

  return page({
    title,
    csp,
    head: preamble,
    body: `<script type="module" src="${moduleUrl}"></script>`,
  });
}

function page(parts: {
  title: string;
  csp: string;
  base?: string;
  head: string;
  body: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${parts.csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${parts.base ? `<base href="${parts.base}">` : ''}
    <title>${escapeHtml(parts.title)}</title>
    ${parts.head}
  </head>
  <body>
    <div id="root"></div>
    ${parts.body}
  </body>
</html>`;
}

function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}
