import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AccountDeletionControl } from './AccountDeletionControl.js';

/** Account settings remain reachable even before a creator claims a public handle. */
export function AccountSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.account-delete-dialog')) return;
      event.preventDefault();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop claim-handle-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={cardRef}
        className="claim-handle-modal-card account-settings-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t('studioPanel.close')}>
          &times;
        </button>
        <header className="claim-handle-modal-head">
          <h2 id={headingId}>{t('creatorProfile.accountSettings')}</h2>
        </header>
        <AccountDeletionControl labelledBy={`${headingId}-danger`} />
      </div>
    </div>,
    document.body,
  );
}
