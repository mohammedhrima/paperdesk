import { useLayoutEffect, useRef, useState } from 'react';
import { Markdown } from '../ui/Markdown';

interface BodyEditorProps {
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
  readonly onOpenLink: (href: string) => void;
  /** Start in edit mode, used right after "Add notes" is chosen. */
  readonly startEditing?: boolean;
  readonly onDone?: () => void;
  readonly className?: string;
}

/**
 * Markdown that reads as rendered text and becomes a plain textarea on click.
 *
 * Showing formatted text by default keeps notes pleasant to scan; switching to
 * raw Markdown only while editing keeps the file on disk exactly what was typed.
 */
export function BodyEditor({
  value,
  placeholder,
  onChange,
  onOpenLink,
  startEditing = false,
  onDone,
  className,
}: BodyEditorProps) {
  const [editing, setEditing] = useState(startEditing);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (startEditing) setEditing(true);
  }, [startEditing]);

  // Grow with the content so the editor never shows a nested scrollbar.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, editing]);

  useLayoutEffect(() => {
    if (!editing) return;
    const textarea = textareaRef.current;
    textarea?.focus();
    textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [editing]);

  const finish = () => {
    setEditing(false);
    onDone?.();
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className={`pd-body-editor pd-body-editor--editing ${className ?? ''}`}
        value={value}
        placeholder={placeholder}
        spellCheck
        rows={2}
        onChange={(event) => onChange(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Escape' || (event.key === 'Enter' && (event.metaKey || event.ctrlKey))) {
            event.preventDefault();
            event.stopPropagation();
            finish();
          }
          // Keep Tab inside the textarea for indenting nested Markdown lists.
          if (event.key === 'Tab') {
            event.preventDefault();
            const { selectionStart, selectionEnd } = event.currentTarget;
            const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
            onChange(next);
            requestAnimationFrame(() =>
              textareaRef.current?.setSelectionRange(selectionStart + 2, selectionStart + 2),
            );
          }
        }}
      />
    );
  }

  if (!value.trim()) {
    return (
      <button
        type="button"
        className={`pd-body-editor pd-body-editor--empty ${className ?? ''}`}
        onClick={() => setEditing(true)}
      >
        {placeholder}
      </button>
    );
  }

  return (
    <div
      className={`pd-body-editor ${className ?? ''}`}
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={() => {
        // Let people select text in the rendered view without entering edit mode.
        if (!window.getSelection()?.toString()) setEditing(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setEditing(true);
        }
      }}
    >
      <Markdown source={value} onOpenLink={onOpenLink} />
    </div>
  );
}
