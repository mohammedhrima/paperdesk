import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from './layout';
import type { PageHighlights } from './PageView';
import { extractPageText, findInPage, type PageText, type SearchMatch } from './textSearch';

/**
 * Searches the whole document as the user types.
 *
 * Pages are scanned in order and results appear as they are found, so the first
 * hits show up immediately even in a long document. Page text is cached, making
 * every search after the first nearly instant.
 */
export function useSearch(pdf: PDFDocumentProxy | null) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [current, setCurrent] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [revealToken, setRevealToken] = useState(0);
  const textCache = useRef(new Map<number, Promise<PageText>>());

  useEffect(() => {
    textCache.current.clear();
  }, [pdf]);

  useEffect(() => {
    const needle = query.trim();
    setMatches([]);
    setCurrent(-1);
    if (!pdf || !needle) {
      setSearching(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found: SearchMatch[] = [];

      for (let page = 1; page <= pdf.numPages && !cancelled; page += 1) {
        const text = await textFor(pdf, page, textCache.current);
        if (cancelled) return;

        const ranges = findInPage(text, needle);
        if (ranges.length === 0) continue;

        found.push(...ranges.map((range) => ({ ...range, page })));
        const isFirstHit = found.length === ranges.length;
        setMatches([...found]);
        if (isFirstHit) {
          setCurrent(0);
          setRevealToken((token) => token + 1);
        }
      }
      if (!cancelled) setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pdf, query]);

  const step = (offset: 1 | -1) => {
    if (matches.length === 0) return;
    setCurrent((index) => (index + offset + matches.length) % matches.length);
    setRevealToken((token) => token + 1);
  };

  /** Highlights grouped per page, with stable identities for unchanged pages. */
  const highlightsByPage = useMemo(() => {
    const byPage = new Map<number, PageHighlights>();
    const grouped = new Map<number, { ranges: SearchMatch[]; current: number }>();

    matches.forEach((match, index) => {
      const entry = grouped.get(match.page) ?? { ranges: [], current: -1 };
      if (index === current) entry.current = entry.ranges.length;
      entry.ranges.push(match);
      grouped.set(match.page, entry);
    });

    for (const [page, entry] of grouped) {
      byPage.set(page, {
        ranges: entry.ranges,
        current: entry.current,
        // Only the page holding the active hit should scroll it into view.
        revealToken: entry.current === -1 ? -1 : revealToken,
      });
    }
    return byPage;
  }, [matches, current, revealToken]);

  return {
    query,
    setQuery,
    matches,
    current,
    currentMatch: matches[current] ?? null,
    searching,
    revealToken,
    next: () => step(1),
    previous: () => step(-1),
    highlightsByPage,
  };
}

function textFor(pdf: PDFDocumentProxy, pageNumber: number, cache: Map<number, Promise<PageText>>) {
  let text = cache.get(pageNumber);
  if (!text) {
    text = pdf.getPage(pageNumber).then(extractPageText);
    cache.set(pageNumber, text);
  }
  return text;
}
