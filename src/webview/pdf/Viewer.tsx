import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { PdfTheme } from '../../config';
import type { PdfHostMessage, PdfViewerOptions, PdfWebviewMessage, ReadingPosition } from '../protocol';
import { postToHost, readViewState, useHostMessages, writeViewState } from '../ui/host';
import { Icon } from '../ui/Icon';
import { PAGE_GAP, PAGE_INDICATOR_MS, POSITION_REPORT_DELAY_MS, READING_LINE, STACK_PADDING_X, STACK_PADDING_Y } from './layout';
import { Outline, type Destination, type OutlineNode } from './Outline';
import { PageView } from './PageView';
import {
  buildLayout,
  clamp,
  pageIndexAt,
  positionAt,
  renderRange,
  resolveZoom,
  scrollTopFor,
  type PageSize,
  type StackLayout,
} from './pageLayout';
import { openDocument } from './pdfjs';
import { SearchBar } from './SearchBar';
import { Toolbar } from './Toolbar';
import { useSearch } from './useSearch';

const post = (message: PdfWebviewMessage) => postToHost(message);

interface LoadedDocument {
  readonly pdf: PDFDocumentProxy;
  readonly fileName: string;
  readonly sizes: readonly PageSize[];
  readonly outline: readonly OutlineNode[];
}

interface ViewMemory {
  readonly outlineOpen: boolean;
}

type Status = { readonly kind: 'loading' } | { readonly kind: 'ready' } | { readonly kind: 'error'; readonly message: string };

/**
 * The PDF reader.
 *
 * Scroll position is the source of truth for "where am I". It is converted to a
 * scale-independent `{ page, offsetRatio }` whenever it needs to survive a
 * change — a zoom, a window resize, closing the tab — and converted back once
 * the new layout exists, so the reader never loses their place.
 */
export function Viewer() {
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [doc, setDoc] = useState<LoadedDocument | null>(null);
  const [options, setOptions] = useState<PdfViewerOptions | null>(null);
  const [zoom, setZoom] = useState<ReadingPosition['zoom']>('fit-width');
  const [theme, setTheme] = useState<PdfTheme>('light');
  const [outlineOpen, setOutlineOpen] = useState(() => readViewState<ViewMemory>({ outlineOpen: false }).outlineOpen);
  const [searchOpen, setSearchOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const [restored, setRestored] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const initialPosition = useRef<ReadingPosition | null>(null);
  const previousLayout = useRef<StackLayout | null>(null);

  const search = useSearch(doc?.pdf ?? null);

  // --- Host messages -------------------------------------------------------

  useHostMessages<PdfHostMessage>((message) => {
    switch (message.type) {
      case 'pdf/open':
        initialPosition.current = message.position;
        setOptions(message.options);
        setZoom(message.position.zoom);
        setTheme(message.position.theme);
        void load(message.data, message.fileName, message.options);
        break;
      case 'pdf/setTheme':
        setTheme(message.theme);
        break;
      case 'pdf/options':
        setOptions(message.options);
        break;
    }
  });

  const load = async (data: Uint8Array, fileName: string, viewerOptions: PdfViewerOptions) => {
    try {
      const pdf = await openDocument(data, viewerOptions);
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, index) => pdf.getPage(index + 1)),
      );
      const sizes = pages.map((page) => {
        const { width, height } = page.getViewport({ scale: 1 });
        return { width, height };
      });
      const outline = ((await pdf.getOutline()) ?? []) as OutlineNode[];
      setDoc({ pdf, fileName, sizes, outline });
      setStatus({ kind: 'ready' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus({ kind: 'error', message });
      post({ type: 'pdf/error', message: `Could not open ${fileName}: ${message}` });
    }
  };

  useEffect(() => post({ type: 'pdf/ready' }), []);
  useEffect(() => () => void doc?.pdf.destroy(), [doc]);

  // --- Layout --------------------------------------------------------------

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [status.kind]);

  const effectiveZoom = useMemo(
    () => (doc && options && viewport.width > 0 ? resolveZoom(zoom, doc.sizes, viewport, options) : 1),
    [doc, options, viewport, zoom],
  );

  const layout = useMemo(() => (doc ? buildLayout(doc.sizes, effectiveZoom) : null), [doc, effectiveZoom]);

  // Restore the saved position once, before the first paint, then keep the
  // reader's place whenever the scale changes.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element || !layout || viewport.width === 0) return;

    const previous = previousLayout.current;
    previousLayout.current = layout;

    if (!restored) {
      const position = initialPosition.current;
      if (position) element.scrollTop = scrollTopFor(layout, position.page, position.offsetRatio);
      scrollTopRef.current = element.scrollTop;
      setScrollTop(element.scrollTop);
      setRestored(true);
      return;
    }

    if (previous && previous.scale !== layout.scale) {
      const { page, offsetRatio } = positionAt(previous, scrollTopRef.current);
      element.scrollTop = scrollTopFor(layout, page, offsetRatio);
      scrollTopRef.current = element.scrollTop;
      setScrollTop(element.scrollTop);
    }
  }, [layout, restored, viewport.width]);

  // --- Scrolling -----------------------------------------------------------

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    let frame = 0;
    let idle: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      scrollTopRef.current = element.scrollTop;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setScrollTop(element.scrollTop));
      setScrolling(true);
      clearTimeout(idle);
      idle = setTimeout(() => setScrolling(false), PAGE_INDICATOR_MS);
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      element.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(idle);
    };
  }, [status.kind]);

  // Report where the reader is, once they pause.
  useEffect(() => {
    if (!layout || !restored) return;
    const timer = setTimeout(() => {
      const { page, offsetRatio } = positionAt(layout, scrollTopRef.current);
      post({ type: 'pdf/position', position: { page, offsetRatio, zoom, theme } });
    }, POSITION_REPORT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [layout, restored, scrollTop, zoom, theme]);

  const goTo = useCallback(
    (page: number, offsetRatio = 0) => {
      const element = scrollRef.current;
      if (element && layout) element.scrollTop = scrollTopFor(layout, page, offsetRatio);
    },
    [layout],
  );

  // A search hit on a page that is not rendered yet needs the page brought into
  // the render window first; once its text layer exists, the page scrolls the
  // exact match into view itself. Rendered pages already handle that, and
  // jumping here too would undo it. Both values are read through a ref so only
  // a new navigation — never a plain layout change — moves the view.
  const navigation = useRef({ goTo, range: { first: 0, last: -1 } });
  const matchPage = search.currentMatch?.page;
  useEffect(() => {
    const { goTo: jump, range: rendered } = navigation.current;
    if (matchPage && (matchPage - 1 < rendered.first || matchPage - 1 > rendered.last)) jump(matchPage);
  }, [matchPage, search.revealToken]);

  // --- Zoom and keyboard ---------------------------------------------------

  const stepZoom = useCallback(
    (direction: 1 | -1) => {
      if (!options) return;
      const next = effectiveZoom + direction * options.zoomStep;
      setZoom(Math.round(clamp(next, options.minZoom, options.maxZoom) * 100) / 100);
    },
    [effectiveZoom, options],
  );

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      stepZoom(event.deltaY < 0 ? 1 : -1);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [stepZoom, status.kind]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (mod && (event.key === '=' || event.key === '+')) {
        event.preventDefault();
        stepZoom(1);
      } else if (mod && event.key === '-') {
        event.preventDefault();
        stepZoom(-1);
      } else if (mod && event.key === '0') {
        event.preventDefault();
        setZoom('fit-width');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [stepZoom]);

  const toggleOutline = () =>
    setOutlineOpen((open) => {
      writeViewState<ViewMemory>({ outlineOpen: !open });
      return !open;
    });

  // --- Render --------------------------------------------------------------

  if (status.kind === 'error') {
    return (
      <div className="pd-viewer-state" role="alert">
        <Icon name="file" size={36} strokeWidth={1.1} />
        <h2>This PDF could not be opened</h2>
        <p>{status.message}</p>
      </div>
    );
  }

  const ready = status.kind === 'ready' && doc && options && layout;
  const pageCount = doc?.sizes.length ?? 0;
  const currentPage = layout ? pageIndexAt(layout, scrollTop + viewport.height * READING_LINE) + 1 : 1;
  const range = ready ? renderRange(layout, scrollTop, viewport.height, options.renderWindow) : { first: 0, last: -1 };
  const maxScroll = layout ? Math.max(layout.totalHeight - viewport.height, 1) : 1;
  navigation.current = { goTo, range };

  const themeStyle = options
    ? ({
        '--pd-page-filter': options.themes[theme].filter,
        '--pd-page-gap': `${PAGE_GAP}px`,
        '--pd-stack-padding': `${STACK_PADDING_Y}px ${STACK_PADDING_X}px`,
      } as CSSProperties)
    : undefined;

  return (
    <div className={`pd-viewer pd-viewer--${theme}`} style={themeStyle}>
      <Toolbar
        fileName={doc?.fileName ?? ''}
        page={currentPage}
        pageCount={pageCount}
        onPageChange={(page) => goTo(page)}
        zoom={zoom}
        effectiveZoom={effectiveZoom}
        minZoom={options?.minZoom ?? 0}
        maxZoom={options?.maxZoom ?? Number.POSITIVE_INFINITY}
        onZoomChange={setZoom}
        onZoomStep={stepZoom}
        theme={theme}
        onThemeChange={setTheme}
        hasOutline={(doc?.outline.length ?? 0) > 0}
        outlineOpen={outlineOpen}
        onToggleOutline={toggleOutline}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((open) => !open)}
        progress={clamp(scrollTop / maxScroll, 0, 1)}
      />

      <div className="pd-viewer__body">
        {doc && outlineOpen && doc.outline.length > 0 && (
          <Outline
            outline={doc.outline}
            pdf={doc.pdf}
            onNavigate={({ pageNumber, offsetRatio }: Destination) => goTo(pageNumber, offsetRatio)}
          />
        )}

        <div className="pd-viewer__scroll-area">
          {searchOpen && (
            <SearchBar
              query={search.query}
              onQueryChange={search.setQuery}
              total={search.matches.length}
              current={search.current}
              searching={search.searching}
              onNext={search.next}
              onPrevious={search.previous}
              onClose={() => {
                setSearchOpen(false);
                search.setQuery('');
              }}
            />
          )}

          <div ref={scrollRef} className="pd-viewer__scroll" tabIndex={-1}>
            {!ready ? (
              <div className="pd-viewer-state" aria-busy="true">
                <div className="pd-spinner" />
                <p>Opening document…</p>
              </div>
            ) : (
              <div className={`pd-stack${restored ? '' : ' pd-stack--hidden'}`}>
                {doc.sizes.map((_, index) => (
                  <PageView
                    key={index}
                    pdf={doc.pdf}
                    pageNumber={index + 1}
                    width={layout.widths[index] ?? 0}
                    height={layout.heights[index] ?? 0}
                    scale={layout.scale}
                    shouldRender={restored && index >= range.first && index <= range.last}
                    theme={theme}
                    options={options}
                    highlights={search.highlightsByPage.get(index + 1) ?? null}
                  />
                ))}
              </div>
            )}
          </div>

          {ready && (
            <div className={`pd-page-indicator${scrolling ? ' pd-page-indicator--visible' : ''}`} aria-live="polite">
              {currentPage} / {pageCount}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
