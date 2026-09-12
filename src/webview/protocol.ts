import type { NoteDoc, TaskNode } from '../core/model.js';
import type { CascadeCompletion, PdfTheme, PdfThemeStyle } from '../config.js';

/**
 * Messages exchanged between the extension host and the webviews.
 *
 * Both sides import this file, so a change to a message shape becomes a
 * compile error on whichever end has not caught up.
 *
 * Note edits send the whole task tree rather than a patch. Notes are small, and
 * a single "here is the document now" message removes an entire class of bugs
 * where the two sides disagree about the order operations were applied in.
 */

/** Enough of a note to render the list without loading its tasks. */
export interface NoteSummary {
  readonly fileName: string;
  readonly title: string;
  readonly updated: string;
  readonly done: number;
  readonly total: number;
}

/** Settings the notes UI needs in order to behave as configured. */
export interface NotesSettings {
  readonly cascadeCompletion: CascadeCompletion;
  readonly confirmBeforeDelete: boolean;
}

/** How much room the surface has, which is all the two views differ by. */
export type Density = 'compact' | 'comfortable';

export type ExportFormat = 'markdown' | 'pdf' | 'preview';

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

export type NotesHostMessage =
  | { readonly type: 'notes/state'; readonly notes: readonly NoteSummary[]; readonly active: NoteDoc | null }
  /**
   * Sent to the surface that made an edit. Its document is already current, so
   * only the list is refreshed — echoing the document back would fight the user's
   * typing with a copy that is a keystroke behind.
   */
  | { readonly type: 'notes/list'; readonly notes: readonly NoteSummary[] }
  | { readonly type: 'notes/settings'; readonly settings: NotesSettings; readonly density: Density }
  | { readonly type: 'notes/error'; readonly message: string };

export type NotesWebviewMessage =
  | { readonly type: 'notes/ready' }
  | { readonly type: 'notes/select'; readonly fileName: string }
  | { readonly type: 'notes/create'; readonly title?: string }
  | { readonly type: 'notes/rename'; readonly fileName: string; readonly title: string }
  | { readonly type: 'notes/delete'; readonly fileName: string }
  | {
      readonly type: 'notes/update';
      readonly fileName: string;
      readonly tasks: readonly TaskNode[];
      readonly intro: string;
    }
  | { readonly type: 'notes/openInEditor'; readonly fileName: string }
  | { readonly type: 'notes/openLink'; readonly href: string }
  | { readonly type: 'notes/openPanel' }
  | { readonly type: 'notes/export'; readonly fileName: string | null; readonly format: ExportFormat }
  | { readonly type: 'notes/confirmDelete'; readonly fileName: string; readonly title: string };

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

/** Where the reader left off, restored the next time the document opens. */
export interface ReadingPosition {
  readonly page: number;
  /** How far into that page the viewport was, 0–1. Keeps zoom changes honest. */
  readonly offsetRatio: number;
  readonly zoom: number | 'fit-width' | 'fit-page';
  readonly theme: PdfTheme;
}

/** Everything the viewer needs that the host has to resolve for it. */
export interface PdfViewerOptions {
  readonly zoomStep: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly renderWindow: number;
  readonly maxCanvasPixels: number;
  readonly textLayer: boolean;
  readonly protectImages: boolean;
  readonly minProtectedImageArea: number;
  readonly maxProtectedImageCoverage: number;
  readonly themes: Readonly<Record<PdfTheme, PdfThemeStyle>>;
  /** Webview URIs for pdf.js resources that must be fetched at runtime. */
  readonly cMapUrl: string;
  readonly standardFontDataUrl: string;
}

export type PdfHostMessage =
  | {
      readonly type: 'pdf/open';
      readonly data: Uint8Array;
      readonly fileName: string;
      readonly options: PdfViewerOptions;
      readonly position: ReadingPosition;
    }
  | { readonly type: 'pdf/setTheme'; readonly theme: PdfTheme }
  | { readonly type: 'pdf/options'; readonly options: PdfViewerOptions };

export type PdfWebviewMessage =
  | { readonly type: 'pdf/ready' }
  | { readonly type: 'pdf/position'; readonly position: ReadingPosition }
  | { readonly type: 'pdf/error'; readonly message: string };
