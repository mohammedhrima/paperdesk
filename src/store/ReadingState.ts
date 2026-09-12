import type * as vscode from 'vscode';
import { pdfConfig, resolvePdfTheme } from '../config.js';
import type { ReadingPosition } from '../webview/protocol.js';

const STORAGE_PREFIX = 'paperdesk.reading:';

/**
 * Remembers where the reader left off in each PDF.
 *
 * Positions live in global state rather than workspace state so a document
 * reopens at the right page no matter which window or folder it is opened
 * from — the way a book keeps its bookmark regardless of which room you read
 * it in.
 */
export class ReadingState {
  constructor(private readonly memento: vscode.Memento) {}

  /** The stored position for a document, or a fresh one at page 1. */
  get(uri: vscode.Uri): ReadingPosition {
    const config = pdfConfig();
    const fallback: ReadingPosition = {
      page: 1,
      offsetRatio: 0,
      zoom: 'fit-width',
      theme: resolvePdfTheme(config.defaultTheme),
    };

    if (!config.restoreLastPage) return fallback;

    const stored = this.memento.get<Partial<ReadingPosition>>(this.key(uri));
    if (!stored) return fallback;

    return {
      page: clampPage(stored.page),
      offsetRatio: clampRatio(stored.offsetRatio),
      zoom: stored.zoom ?? fallback.zoom,
      // A theme pinned in settings wins over whatever was last used.
      theme: config.defaultTheme === 'auto' ? (stored.theme ?? fallback.theme) : fallback.theme,
    };
  }

  async set(uri: vscode.Uri, position: ReadingPosition): Promise<void> {
    await this.memento.update(this.key(uri), position);
  }

  private key(uri: vscode.Uri): string {
    return `${STORAGE_PREFIX}${uri.toString()}`;
  }
}

function clampPage(page: number | undefined): number {
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

function clampRatio(ratio: number | undefined): number {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return 0;
  return Math.min(Math.max(ratio, 0), 1);
}
