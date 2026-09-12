import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useState } from 'react';
import { Icon } from '../ui/Icon';

export interface OutlineNode {
  readonly title: string;
  readonly dest: string | unknown[] | null;
  readonly items: readonly OutlineNode[];
}

/** A resolved outline destination: which page, and how far down it. */
export interface Destination {
  readonly pageNumber: number;
  /** Fraction of the page height from the top, 0–1. */
  readonly offsetRatio: number;
}

interface OutlineProps {
  readonly outline: readonly OutlineNode[];
  readonly pdf: PDFDocumentProxy;
  readonly onNavigate: (destination: Destination) => void;
}

/** The document's bookmarks, as a collapsible tree. */
export function Outline({ outline, pdf, onNavigate }: OutlineProps) {
  return (
    <nav className="pd-outline" aria-label="Document outline">
      <div className="pd-outline__heading">Contents</div>
      <ul className="pd-outline__list" role="tree">
        {outline.map((node, index) => (
          <OutlineItem key={`${index}-${node.title}`} node={node} pdf={pdf} onNavigate={onNavigate} depth={0} />
        ))}
      </ul>
    </nav>
  );
}

function OutlineItem({
  node,
  pdf,
  onNavigate,
  depth,
}: {
  readonly node: OutlineNode;
  readonly pdf: PDFDocumentProxy;
  readonly onNavigate: (destination: Destination) => void;
  readonly depth: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.items.length > 0;

  const navigate = async () => {
    const destination = await resolveDestination(pdf, node.dest);
    if (destination) onNavigate(destination);
  };

  return (
    <li role="treeitem" aria-expanded={hasChildren ? open : undefined}>
      <div className="pd-outline__row" style={{ paddingLeft: `calc(${depth} * var(--pd-space-3) + var(--pd-space-1))` }}>
        <button
          type="button"
          className={`pd-outline__toggle${hasChildren ? '' : ' pd-outline__toggle--empty'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={-1}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} strokeWidth={1.8} />
        </button>
        <button type="button" className="pd-outline__link" title={node.title} onClick={() => void navigate()}>
          {node.title}
        </button>
      </div>
      {hasChildren && open && (
        <ul className="pd-outline__list" role="group">
          {node.items.map((child, index) => (
            <OutlineItem key={`${index}-${child.title}`} node={child} pdf={pdf} onNavigate={onNavigate} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Turns a PDF destination into a page and vertical offset. Destinations can be
 * named (looked up in the document) or explicit arrays whose second entry says
 * how the target should be framed.
 */
export async function resolveDestination(
  pdf: PDFDocumentProxy,
  dest: OutlineNode['dest'],
): Promise<Destination | null> {
  const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
  if (!Array.isArray(explicit) || explicit.length === 0) return null;

  const [ref, mode, ...args] = explicit as [unknown, { name?: string } | undefined, ...unknown[]];
  const pageIndex =
    typeof ref === 'number' ? ref : await pdf.getPageIndex(ref as Parameters<PDFDocumentProxy['getPageIndex']>[0]);

  // XYZ carries [left, top, zoom]; FitH and FitBH carry [top]. Other modes frame the whole page.
  const top = mode?.name === 'XYZ' ? args[1] : mode?.name === 'FitH' || mode?.name === 'FitBH' ? args[0] : null;
  if (typeof top !== 'number') return { pageNumber: pageIndex + 1, offsetRatio: 0 };

  const page = await pdf.getPage(pageIndex + 1);
  const viewport = page.getViewport({ scale: 1 });
  const [, y] = viewport.convertToViewportPoint(0, top);
  return { pageNumber: pageIndex + 1, offsetRatio: Math.min(Math.max((y ?? 0) / viewport.height, 0), 1) };
}
