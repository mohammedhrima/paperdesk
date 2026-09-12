import * as vscode from 'vscode';

/**
 * Typed access to every setting the extension contributes.
 *
 * Nothing tunable is written as a literal elsewhere in the codebase: defaults
 * live in `package.json` under `contributes.configuration`, and this module is
 * the only thing that reads them. Adding a knob means adding it in those two
 * places and nowhere else.
 */

const SECTION = 'paperdesk';

export type PdfTheme = 'light' | 'dark' | 'sepia';
export type PdfThemePreference = PdfTheme | 'auto';
export type CascadeCompletion = 'ask' | 'always' | 'never';
export type ExportTheme = 'light' | 'dark';

/** Appearance of a single PDF reading theme. */
export interface PdfThemeStyle {
  /** CSS filter applied to the rendered page canvas. */
  readonly filter: string;
  /** Color painted behind the page, before the filter runs. */
  readonly pageBackground: string;
}

export interface NotesConfig {
  readonly folderName: string;
  readonly saveDebounceMs: number;
  readonly confirmBeforeDelete: boolean;
  readonly cascadeCompletion: CascadeCompletion;
}

export interface PdfConfig {
  readonly defaultTheme: PdfThemePreference;
  readonly zoomStep: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly renderWindow: number;
  readonly maxCanvasPixels: number;
  readonly restoreLastPage: boolean;
  readonly textLayer: boolean;
  readonly protectImages: boolean;
  readonly minProtectedImageArea: number;
  readonly maxProtectedImageCoverage: number;
  readonly themes: Readonly<Record<PdfTheme, PdfThemeStyle>>;
}

export interface ExportConfig {
  readonly browserPath: string;
  readonly pageFormat: string;
  readonly margin: string;
  readonly includeCompleted: boolean;
  readonly includeFrontmatter: boolean;
  readonly theme: ExportTheme;
  readonly accentColor: string;
}

/** Reads one setting, falling back to its contributed default. */
function read<T>(scope: vscode.ConfigurationScope | undefined, key: string, fallback: T): T {
  return vscode.workspace.getConfiguration(SECTION, scope).get<T>(key) ?? fallback;
}

export function notesConfig(scope?: vscode.ConfigurationScope): NotesConfig {
  return {
    folderName: read(scope, 'notes.folderName', '.notes'),
    saveDebounceMs: read(scope, 'notes.saveDebounceMs', 400),
    confirmBeforeDelete: read(scope, 'notes.confirmBeforeDelete', true),
    cascadeCompletion: read<CascadeCompletion>(scope, 'notes.cascadeCompletion', 'always'),
  };
}

export function pdfConfig(scope?: vscode.ConfigurationScope): PdfConfig {
  return {
    defaultTheme: read<PdfThemePreference>(scope, 'pdf.defaultTheme', 'auto'),
    zoomStep: read(scope, 'pdf.zoomStep', 0.15),
    minZoom: read(scope, 'pdf.minZoom', 0.25),
    maxZoom: read(scope, 'pdf.maxZoom', 6),
    renderWindow: read(scope, 'pdf.renderWindow', 2),
    maxCanvasPixels: read(scope, 'pdf.maxCanvasPixels', 16_777_216),
    restoreLastPage: read(scope, 'pdf.restoreLastPage', true),
    textLayer: read(scope, 'pdf.textLayer', true),
    protectImages: read(scope, 'pdf.dark.protectImages', true),
    minProtectedImageArea: read(scope, 'pdf.dark.minProtectedImageArea', 2500),
    maxProtectedImageCoverage: read(scope, 'pdf.dark.maxProtectedImageCoverage', 0.85),
    themes: {
      // Light is the PDF as authored: no filter, no repainted background.
      light: { filter: 'none', pageBackground: '#ffffff' },
      dark: {
        filter: read(scope, 'pdf.dark.filter', 'invert(0.88) hue-rotate(180deg)'),
        pageBackground: read(scope, 'pdf.dark.pageBackground', '#ffffff'),
      },
      sepia: {
        filter: read(scope, 'pdf.sepia.filter', 'sepia(0.35) brightness(0.96) contrast(0.95)'),
        pageBackground: read(scope, 'pdf.sepia.pageBackground', '#ffffff'),
      },
    },
  };
}

export function exportConfig(scope?: vscode.ConfigurationScope): ExportConfig {
  return {
    browserPath: read(scope, 'export.browserPath', ''),
    pageFormat: read(scope, 'export.pageFormat', 'A4'),
    margin: read(scope, 'export.margin', '18mm 16mm'),
    includeCompleted: read(scope, 'export.includeCompleted', true),
    includeFrontmatter: read(scope, 'export.includeFrontmatter', false),
    theme: read<ExportTheme>(scope, 'export.theme', 'light'),
    accentColor: read(scope, 'export.accentColor', '#4f46e5'),
  };
}

/** Fires when any PaperDesk setting changes. */
export function onDidChangeConfig(listener: () => void): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SECTION)) listener();
  });
}

/**
 * Resolves the `auto` theme preference against the window's current color
 * theme, so PDFs match the editor unless the user pinned a theme.
 */
export function resolvePdfTheme(preference: PdfThemePreference): PdfTheme {
  if (preference !== 'auto') return preference;

  const kind = vscode.window.activeColorTheme.kind;
  const isDark =
    kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
  return isDark ? 'dark' : 'light';
}
