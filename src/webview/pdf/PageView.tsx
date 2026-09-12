import {
  RenderingCancelledException,
  TextLayer,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type PageViewport,
} from 'pdfjs-dist';
import { memo, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { PdfTheme } from '../../config';
import type { PdfViewerOptions } from '../protocol';
import { findImagePlacements, projectRegions, type ImagePlacement } from './imageRegions';
import { highlightTextLayer, pageTextFrom, type PageText, type TextRange } from './textSearch';

/** Image placements are a property of the page, so they are found once and reused. */
const placementCache = new WeakMap<PDFPageProxy, Promise<ImagePlacement[]>>();

function placementsFor(page: PDFPageProxy): Promise<ImagePlacement[]> {
  let cached = placementCache.get(page);
  if (!cached) {
    cached = findImagePlacements(page);
    placementCache.set(page, cached);
  }
  return cached;
}

export interface PageHighlights {
  readonly ranges: readonly TextRange[];
  /** Index into `ranges` of the active match, or -1. */
  readonly current: number;
  /** Changes whenever the view should scroll the active match into view. */
  readonly revealToken: number;
}

interface PageViewProps {
  readonly pdf: PDFDocumentProxy;
  readonly pageNumber: number;
  /** Page size in CSS pixels at the current scale. */
  readonly width: number;
  readonly height: number;
  /** pdf.js viewport scale: zoom multiplied by CSS units per point. */
  readonly scale: number;
  readonly shouldRender: boolean;
  readonly theme: PdfTheme;
  readonly options: PdfViewerOptions;
  readonly highlights: PageHighlights | null;
}

/**
 * One page of the document.
 *
 * Pages outside the render window are empty boxes of the right size, so the
 * scrollbar is accurate from the start while memory stays proportional to what
 * is on screen. A re-render draws into a fresh canvas and swaps it in only when
 * finished, so zooming never flashes a blank page.
 */
export const PageView = memo(function PageView({
  pdf,
  pageNumber,
  width,
  height,
  scale,
  shouldRender,
  theme,
  options,
  highlights,
}: PageViewProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const imageLayerRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<{ spans: HTMLElement[]; content: PageText } | null>(null);
  const [rendered, setRendered] = useState(false);

  const { pageBackground } = options.themes[theme];
  const protectImages = theme === 'dark' && options.protectImages;

  // Canvas and image protection.
  useEffect(() => {
    const canvasHost = canvasHostRef.current;
    const imageLayer = imageLayerRef.current;
    if (!canvasHost || !imageLayer) return;

    if (!shouldRender) {
      canvasHost.replaceChildren();
      imageLayer.replaceChildren();
      setRendered(false);
      return;
    }

    let cancelled = false;
    let cancelRender: (() => void) | undefined;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      const outputScale = pixelRatioFor(viewport, options.maxCanvasPixels);

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) return;

      const task = page.render({
        canvasContext: context,
        viewport,
        background: pageBackground,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      });
      cancelRender = () => task.cancel();

      try {
        await task.promise;
      } catch (error) {
        if (error instanceof RenderingCancelledException) return;
        throw error;
      }
      if (cancelled) return;

      const overlays = protectImages
        ? projectRegions(await placementsFor(page), viewport, {
            minArea: options.minProtectedImageArea,
            maxCoverage: options.maxProtectedImageCoverage,
          }).map((region) => copyRegion(canvas, region, outputScale))
        : [];
      if (cancelled) return;

      canvasHost.replaceChildren(canvas);
      imageLayer.replaceChildren(...overlays);
      setRendered(true);
    })().catch((error: unknown) => console.error(`PaperDesk: page ${pageNumber} failed to render`, error));

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [
    pdf,
    pageNumber,
    scale,
    shouldRender,
    pageBackground,
    protectImages,
    options.maxCanvasPixels,
    options.minProtectedImageArea,
    options.maxProtectedImageCoverage,
  ]);

  // Selectable text.
  useEffect(() => {
    const container = textLayerRef.current;
    if (!container) return;

    if (!shouldRender || !options.textLayer) {
      container.replaceChildren();
      setText(null);
      return;
    }

    let layer: TextLayer | undefined;
    let cancelled = false;

    (async () => {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      if (cancelled) return;

      container.replaceChildren();
      layer = new TextLayer({ textContentSource: content, container, viewport: page.getViewport({ scale }) });
      await layer.render();
      if (cancelled) return;

      setText({ spans: layer.textDivs as HTMLElement[], content: pageTextFrom(content) });
    })().catch((error: unknown) => {
      if (!cancelled) console.error(`PaperDesk: text layer for page ${pageNumber} failed`, error);
    });

    return () => {
      cancelled = true;
      layer?.cancel();
    };
  }, [pdf, pageNumber, scale, shouldRender, options.textLayer]);

  // Search highlights, re-applied whenever the text layer is rebuilt.
  const revealToken = highlights?.revealToken;
  const lastRevealed = useRef<number | undefined>();
  useEffect(() => {
    if (!text) return;
    const mark = highlightTextLayer(
      text.spans,
      text.content,
      highlights?.ranges ?? [],
      highlights?.current ?? -1,
    );
    if (mark && revealToken !== undefined && lastRevealed.current !== revealToken) {
      lastRevealed.current = revealToken;
      centerInScrollContainer(mark);
    }
  }, [text, highlights, revealToken]);

  const style = { width, height, '--scale-factor': scale } as CSSProperties;

  return (
    <div
      className={`pd-page${rendered ? ' pd-page--rendered' : ''}`}
      style={style}
      data-page-number={pageNumber}
      aria-label={`Page ${pageNumber}`}
      role="region"
    >
      <div ref={canvasHostRef} className="pd-page__canvas" />
      <div ref={imageLayerRef} className="pd-page__images" aria-hidden="true" />
      <div ref={textLayerRef} className="textLayer" />
    </div>
  );
});

/**
 * Centers an element within the nearest scrolling ancestor only. The built-in
 * `scrollIntoView` also scrolls every outer ancestor, which would drag the
 * toolbar off screen along with the page.
 */
function centerInScrollContainer(element: HTMLElement): void {
  let container = element.parentElement;
  while (container && !isScrollable(container)) container = container.parentElement;
  if (!container) return;

  const target = element.getBoundingClientRect();
  const frame = container.getBoundingClientRect();
  container.scrollBy({
    top: target.top - frame.top - (frame.height - target.height) / 2,
    left: target.left < frame.left || target.right > frame.right ? target.left - frame.left - (frame.width - target.width) / 2 : 0,
  });
}

function isScrollable(element: HTMLElement): boolean {
  const { overflowY, overflowX } = getComputedStyle(element);
  return /auto|scroll/.test(overflowY) || /auto|scroll/.test(overflowX);
}

/**
 * Device pixels per CSS pixel for this page: sharp on high-DPI screens, but
 * capped so a huge page at high zoom cannot allocate an enormous canvas.
 */
function pixelRatioFor(viewport: PageViewport, maxCanvasPixels: number): number {
  const ideal = window.devicePixelRatio || 1;
  const cap = Math.sqrt(maxCanvasPixels / (viewport.width * viewport.height));
  return Math.max(Math.min(ideal, cap), Number.EPSILON);
}

/**
 * Copies a region of the rendered page into its own canvas.
 *
 * The page canvas keeps its original pixels — the dark theme is a CSS filter on
 * top — so a copy placed outside the filtered element shows the image in its
 * true colors with no inverse filter arithmetic at all.
 */
function copyRegion(
  source: HTMLCanvasElement,
  region: { x: number; y: number; width: number; height: number },
  outputScale: number,
): HTMLCanvasElement {
  // Round inward: rounding outward would copy a sliver of the page around the
  // image, which shows up as a bright hairline against the dark page.
  const sx = Math.ceil(region.x * outputScale);
  const sy = Math.ceil(region.y * outputScale);
  const sw = Math.max(1, Math.floor((region.x + region.width) * outputScale) - sx);
  const sh = Math.max(1, Math.floor((region.y + region.height) * outputScale) - sy);

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d')?.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);

  Object.assign(canvas.style, {
    left: `${sx / outputScale}px`,
    top: `${sy / outputScale}px`,
    width: `${sw / outputScale}px`,
    height: `${sh / outputScale}px`,
  });
  return canvas;
}
