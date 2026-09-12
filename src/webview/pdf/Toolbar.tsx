import { useEffect, useRef, useState } from 'react';
import type { PdfTheme } from '../../config';
import type { ReadingPosition } from '../protocol';
import { Icon, type IconName } from '../ui/Icon';
import { Menu, type MenuItem } from '../ui/Menu';
import { ZOOM_PRESETS } from './layout';

const THEMES: readonly { readonly id: PdfTheme; readonly icon: IconName; readonly label: string }[] = [
  { id: 'light', icon: 'sun', label: 'Light' },
  { id: 'sepia', icon: 'book', label: 'Sepia' },
  { id: 'dark', icon: 'moon', label: 'Dark' },
];

interface ToolbarProps {
  readonly fileName: string;
  readonly page: number;
  readonly pageCount: number;
  readonly onPageChange: (page: number) => void;
  readonly zoom: ReadingPosition['zoom'];
  /** The zoom actually in effect, which for fit modes depends on the window. */
  readonly effectiveZoom: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  readonly onZoomChange: (zoom: ReadingPosition['zoom']) => void;
  readonly onZoomStep: (direction: 1 | -1) => void;
  readonly theme: PdfTheme;
  readonly onThemeChange: (theme: PdfTheme) => void;
  readonly hasOutline: boolean;
  readonly outlineOpen: boolean;
  readonly onToggleOutline: () => void;
  readonly searchOpen: boolean;
  readonly onToggleSearch: () => void;
  readonly progress: number;
}

export function Toolbar(props: ToolbarProps) {
  const { page, pageCount, effectiveZoom, zoom, minZoom, maxZoom } = props;

  const zoomItems: MenuItem[] = [
    { label: 'Fit width', icon: zoom === 'fit-width' ? 'check' : 'fitWidth', hint: 'Ctrl 0', onSelect: () => props.onZoomChange('fit-width') },
    { label: 'Fit page', icon: zoom === 'fit-page' ? 'check' : 'fitPage', onSelect: () => props.onZoomChange('fit-page') },
    ...ZOOM_PRESETS.filter((preset) => preset >= minZoom && preset <= maxZoom).map((preset, index) => ({
      label: `${Math.round(preset * 100)}%`,
      icon: zoom === preset ? ('check' as const) : undefined,
      separated: index === 0,
      onSelect: () => props.onZoomChange(preset),
    })),
  ];

  return (
    <header className="pd-toolbar">
      <div className="pd-toolbar__group">
        {props.hasOutline && (
          <button
            type="button"
            className="pd-icon-button"
            aria-pressed={props.outlineOpen}
            title="Contents"
            aria-label="Toggle contents"
            onClick={props.onToggleOutline}
          >
            <Icon name="outline" />
          </button>
        )}
        <span className="pd-toolbar__file" title={props.fileName}>
          {props.fileName}
        </span>
      </div>

      <div className="pd-toolbar__group pd-toolbar__group--center">
        <PageInput page={page} pageCount={pageCount} onChange={props.onPageChange} />
        <span className="pd-toolbar__divider" />
        <button
          type="button"
          className="pd-icon-button"
          title="Zoom out (Ctrl −)"
          aria-label="Zoom out"
          disabled={effectiveZoom <= minZoom}
          onClick={() => props.onZoomStep(-1)}
        >
          <Icon name="zoomOut" />
        </button>
        <Menu
          label="Zoom level"
          align="start"
          triggerClassName="pd-toolbar__zoom"
          trigger={<span>{Math.round(effectiveZoom * 100)}%</span>}
          items={zoomItems}
        />
        <button
          type="button"
          className="pd-icon-button"
          title="Zoom in (Ctrl +)"
          aria-label="Zoom in"
          disabled={effectiveZoom >= maxZoom}
          onClick={() => props.onZoomStep(1)}
        >
          <Icon name="zoomIn" />
        </button>
      </div>

      <div className="pd-toolbar__group pd-toolbar__group--end">
        <div className="pd-segmented" role="radiogroup" aria-label="Reading theme">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={props.theme === theme.id}
              className={`pd-segmented__option${props.theme === theme.id ? ' pd-segmented__option--active' : ''}`}
              title={`${theme.label} theme`}
              aria-label={`${theme.label} theme`}
              onClick={() => props.onThemeChange(theme.id)}
            >
              <Icon name={theme.icon} size={14} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className="pd-icon-button"
          aria-pressed={props.searchOpen}
          title="Find (Ctrl F)"
          aria-label="Find in document"
          onClick={props.onToggleSearch}
        >
          <Icon name="search" />
        </button>
      </div>

      <div className="pd-toolbar__progress" aria-hidden="true">
        <div className="pd-toolbar__progress-fill" style={{ transform: `scaleX(${props.progress})` }} />
      </div>
    </header>
  );
}

/** The page number box: shows where you are, and jumps when you type a number. */
function PageInput({
  page,
  pageCount,
  onChange,
}: {
  readonly page: number;
  readonly pageCount: number;
  readonly onChange: (page: number) => void;
}) {
  const [draft, setDraft] = useState(String(page));
  const [editing, setEditing] = useState(false);
  // Escape blurs the input too; this stops that blur from committing the draft.
  const discard = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(String(page));
  }, [page, editing]);

  const commit = () => {
    setEditing(false);
    if (discard.current) {
      discard.current = false;
      setDraft(String(page));
      return;
    }
    const target = Number.parseInt(draft, 10);
    if (Number.isFinite(target)) onChange(Math.min(Math.max(target, 1), pageCount));
    else setDraft(String(page));
  };

  return (
    <label className="pd-page-input">
      <input
        value={draft}
        inputMode="numeric"
        aria-label="Current page"
        style={{ width: `${String(pageCount).length + 1}ch` }}
        onFocus={(event) => {
          setEditing(true);
          event.currentTarget.select();
        }}
        onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            discard.current = true;
            event.currentTarget.blur();
          }
        }}
      />
      <span className="pd-page-input__total">/ {pageCount}</span>
    </label>
  );
}
