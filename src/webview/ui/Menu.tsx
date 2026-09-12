import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import './menu.css';

export interface MenuItem {
  readonly label: string;
  readonly icon?: IconName;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly hint?: string;
  /** Draws a divider above this item. */
  readonly separated?: boolean;
}

interface MenuProps {
  readonly items: readonly MenuItem[];
  readonly label: string;
  /** Custom trigger content. Defaults to a "more" icon button. */
  readonly trigger?: ReactNode;
  readonly triggerClassName?: string;
  readonly align?: 'start' | 'end';
}

/**
 * A dropdown menu. Closes on selection, outside click and Escape, and supports
 * arrow-key navigation so it is usable without a mouse.
 */
export function Menu({ items, label, trigger, triggerClassName, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    listRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onListKeyDown = (event: React.KeyboardEvent) => {
    const buttons = [...(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      rootRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  };

  return (
    <div className="pd-menu" ref={rootRef}>
      <button
        type="button"
        className={triggerClassName ?? 'pd-icon-button'}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger ?? <Icon name="more" strokeWidth={2.4} />}
      </button>

      {open && (
        <div
          id={menuId}
          ref={listRef}
          role="menu"
          className={`pd-menu__list pd-menu__list--${align}`}
          onKeyDown={onListKeyDown}
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separated && <div className="pd-menu__separator" role="separator" />}
              <button
                type="button"
                role="menuitem"
                className={`pd-menu__item${item.danger ? ' pd-menu__item--danger' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon ? <Icon name={item.icon} size={14} /> : <span className="pd-menu__spacer" />}
                <span className="pd-menu__label">{item.label}</span>
                {item.hint && <span className="pd-menu__hint">{item.hint}</span>}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
