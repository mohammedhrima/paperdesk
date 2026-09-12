import { useMemo, type MouseEvent } from 'react';
import { renderInlineMarkdown, renderMarkdown } from '../../export/markdownToHtml';

interface MarkdownProps {
  readonly source: string;
  readonly inline?: boolean;
  readonly className?: string;
  /** Called with a link's href instead of letting the webview navigate away. */
  readonly onOpenLink: (href: string) => void;
}

/**
 * Renders Markdown with the same GFM dialect used for exports.
 *
 * Raw HTML in the source is escaped by the renderer, so injecting the result is
 * safe. Link clicks are intercepted: navigating the webview itself would replace
 * the whole app with the linked page.
 */
export function Markdown({ source, inline = false, className, onOpenLink }: MarkdownProps) {
  const html = useMemo(
    () => (inline ? renderInlineMarkdown(source) : renderMarkdown(source)),
    [source, inline],
  );

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    const href = anchor.getAttribute('href');
    if (href) onOpenLink(href);
  };

  const Tag = inline ? 'span' : 'div';
  return (
    <Tag
      className={[inline ? '' : 'pd-markdown', className].filter(Boolean).join(' ')}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
