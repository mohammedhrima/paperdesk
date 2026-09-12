import { readFileSync } from 'node:fs';
import * as vscode from 'vscode';
import { WEBVIEW_ENTRIES, type WebviewEntry } from '../shared/dev.js';

/** The subset of Vite's build manifest the extension reads. */
interface ManifestChunk {
  readonly file: string;
  readonly css?: readonly string[];
  readonly imports?: readonly string[];
}

type Manifest = Readonly<Record<string, ManifestChunk>>;

export interface EntryAssets {
  readonly script: string;
  readonly styles: readonly string[];
}

const MANIFEST_PATH = ['dist', 'webview', '.vite', 'manifest.json'];

let cached: Manifest | undefined;

/**
 * Resolves the built files a webview entry needs.
 *
 * Vite moves code shared by both apps — React, the design tokens — into common
 * chunks with their own stylesheets. Linking only `<entry>.css` would silently
 * drop those, so the stylesheets are collected by walking the entry's imports.
 */
export function entryAssets(extensionUri: vscode.Uri, entry: WebviewEntry): EntryAssets {
  const manifest = loadManifest(extensionUri);
  const root = manifest[WEBVIEW_ENTRIES[entry]];
  if (!root) throw new Error(`The webview bundle for "${entry}" is missing. Run "npm run build".`);

  const styles = new Set<string>();
  const visited = new Set<string>();
  const collect = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    chunk?.imports?.forEach(collect);
    chunk?.css?.forEach((file) => styles.add(file));
  };
  collect(WEBVIEW_ENTRIES[entry]);

  return { script: root.file, styles: [...styles] };
}

function loadManifest(extensionUri: vscode.Uri): Manifest {
  cached ??= JSON.parse(
    readFileSync(vscode.Uri.joinPath(extensionUri, ...MANIFEST_PATH).fsPath, 'utf8'),
  ) as Manifest;
  return cached;
}
