import { useEffect, useRef } from 'react';
import { Icon } from '../ui/Icon';

interface SearchBarProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly total: number;
  readonly current: number;
  readonly searching: boolean;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly onClose: () => void;
}

/** The floating find bar. Enter steps forward, Shift+Enter back, Escape closes. */
export function SearchBar(props: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const status = !props.query.trim()
    ? ''
    : props.total === 0
      ? props.searching
        ? 'Searching…'
        : 'No results'
      : `${props.current + 1} of ${props.total}${props.searching ? '+' : ''}`;

  return (
    <div className="pd-search-bar" role="search">
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        value={props.query}
        placeholder="Find in document"
        aria-label="Find in document"
        spellCheck={false}
        onChange={(event) => props.onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (event.shiftKey) props.onPrevious();
            else props.onNext();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            props.onClose();
          }
        }}
      />
      <span className={`pd-search-bar__status${props.query && props.total === 0 && !props.searching ? ' pd-search-bar__status--empty' : ''}`}>
        {status}
      </span>
      <button type="button" className="pd-icon-button" aria-label="Previous match" title="Previous (Shift+Enter)" disabled={props.total === 0} onClick={props.onPrevious}>
        <Icon name="arrowUp" size={14} />
      </button>
      <button type="button" className="pd-icon-button" aria-label="Next match" title="Next (Enter)" disabled={props.total === 0} onClick={props.onNext}>
        <Icon name="arrowDown" size={14} />
      </button>
      <button type="button" className="pd-icon-button" aria-label="Close search" title="Close (Escape)" onClick={props.onClose}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
