import { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './admin-jobs-queue.css';
import './admin-jobs-preview.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  // First render, before commit moves focus.
  if (openerRef.current === undefined) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useLayoutEffect(() => {
    confirmRef.current?.focus();
    return () => {
      openerRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        if (!busyRef.current) onDismissRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = cardRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      const outside = !root.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    // Capture so Escape cannot close the parent preview.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  return createPortal(
    <div
      className="admin-job-confirm-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss();
      }}
    >
      <div
        ref={cardRef}
        className={danger ? 'admin-job-confirm is-danger' : 'admin-job-confirm'}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
      >
        <h3 id={titleId}>{title}</h3>
        <p id={bodyId}>{body}</p>
        <div className="admin-job-confirm-actions">
          <button type="button" className="admin-job-cancel" onClick={onDismiss} disabled={busy}>
            {dismissLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={danger ? 'admin-job-cancel is-armed' : 'admin-job-publish is-promoted'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (busyLabel ?? 'Working…') : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
