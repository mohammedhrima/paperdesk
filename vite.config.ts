import { fileURLToPath } from 'node:url';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { DEV_SERVER_ORIGIN, DEV_SERVER_PORT, WEBVIEW_ENTRIES } from './src/shared/dev';

const root = path.dirname(fileURLToPath(import.meta.url));
const webviewRoot = path.join(root, 'src/webview');

const entries = Object.fromEntries(
  Object.entries(WEBVIEW_ENTRIES).map(([name, file]) => [name, path.join(webviewRoot, file)]),
);

/**
 * Builds the two webview apps. The extension host writes its own HTML shell — so
 * that it can inject a CSP nonce and rewrite asset paths to `vscode-webview://`
 * URIs — which is why there are no HTML entry points here.
 */
export default defineConfig(({ mode }) => ({
  root: webviewRoot,
  plugins: [react()],
  // Assets are addressed through `asWebviewUri`, never from the document root.
  base: './',
  build: {
    outDir: path.join(root, 'dist/webview'),
    emptyOutDir: true,
    target: 'es2022',
    // Maps help while debugging a dev build; they have no place in the package.
    sourcemap: mode !== 'production',
    // Tells the extension which stylesheets each entry needs, including those
    // Vite moves into chunks shared between the two apps.
    manifest: true,
    rollupOptions: {
      input: entries,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
  server: {
    port: DEV_SERVER_PORT,
    strictPort: true,
    // The webview is a different origin, so it must be allowed to fetch modules.
    cors: true,
    origin: DEV_SERVER_ORIGIN,
  },
}));
