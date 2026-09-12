import { useCallback, useEffect, useRef, useState } from 'react';
import './dialog.css';

export interface ConfirmRequest {
  readonly title: string;
  readonly message?: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
}

/**
 * An in-webview confirmation dialog.
 *
 * Webviews block `window.confirm`, and a round trip to a native modal for a
 * quick yes/no would feel sluggish, so this renders inline and resolves a
 * promise with the user's answer.
 */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const resolver = useRef<(answer: boolean) => void>();

  const confirm = useCallback((next: ConfirmRequest) => {
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = undefined;
    setRequest(null);
  }, []);

  const dialog = request ? <ConfirmDialog request={request} onAnswer={answer} /> : null;
  return { confirm, dialog };
}

function ConfirmDialog({
  request,
  onAnswer,
}: {
  readonly request: ConfirmRequest;
  readonly onAnswer: (value: boolean) => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    return () => previous?.focus();
  }, []);

  return (
    <div
      className="pd-dialog__backdrop"
      onPointerDown={(event) => event.target === event.currentTarget && onAnswer(false)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onAnswer(false);
        }
      }}
    >
      <div className="pd-dialog" role="alertdialog" aria-modal="true" aria-labelledby="pd-dialog-title">
        <h2 id="pd-dialog-title" className="pd-dialog__title">
          {request.title}
        </h2>
        {request.message && <p className="pd-dialog__message">{request.message}</p>}
        <div className="pd-dialog__actions">
          <button type="button" className="pd-button pd-button--ghost" onClick={() => onAnswer(false)}>
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`pd-button${request.danger ? ' pd-button--danger' : ''}`}
            onClick={() => onAnswer(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
