import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';

export function AdminConfirmDialog({
  title,
  body,
  confirmLabel,
  dismissLabel = 'Back',
  danger = false,
  busy = false,
  busyLabel,
  onConfirm,
  onDismiss,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  dismissLabel?: string;
  danger?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!busy) onDismiss();
    };
    // Capture so Escape cannot close the parent preview.
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
  }, [busy, onDismiss]);

  return createPortal(
    <div
      className="admin-job-confirm-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss();
      }}
    >
      <div
        className={danger ? 'admin-job-confirm is-danger' : 'admin-job-confirm'}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={bodyId}>{body}</p>
        <div className="admin-job-confirm-actions">
          <button type="button" className="admin-job-cancel" onClick={onDismiss} disabled={busy}>
            {dismissLabel}
          </button>
          <button
            type="button"
            className={danger ? 'admin-job-cancel is-armed' : 'admin-job-publish is-promoted'}
            onClick={onConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? (busyLabel ?? 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
