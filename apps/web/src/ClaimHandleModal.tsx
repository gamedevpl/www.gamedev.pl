import { useEffect, useId, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStudioCreatorProfile } from './studioCreatorProfile.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath } from './core/router.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Claim a public handle at the publish moment — not as Studio page chrome.
 * Must render under StudioCreatorProfileProvider.
 */
export function ClaimHandleModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const formId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const clearMessageRef = useRef<() => void>(() => undefined);
  const {
    me,
    status,
    handleInput,
    nameInput,
    availability,
    message,
    setHandleInput,
    onClaim,
    refusalCopy,
    clearMessage,
  } = useStudioCreatorProfile();

  onCloseRef.current = onClose;
  clearMessageRef.current = clearMessage;

  useEffect(() => {
    if (isOpen && me?.publishReady) onClose();
  }, [isOpen, me?.publishReady, onClose]);

  // Escape, focus trap, and restore focus to whatever opened the dialog (the claim CTA).
  // Depend only on `isOpen` so typing (provider re-renders) does not re-run cleanup and
  // yank focus back to the opener mid-edit.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        clearMessageRef.current();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = cardRef.current;
      if (!root) return;
      // Do not use offsetParent — it is null for descendants of position:fixed backdrops.
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0,
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey) {
        if (document.activeElement === first || !root.contains(document.activeElement)) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last || !root.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const previewHandle = (handleInput.trim() || 'you').toLowerCase();
  const previewName = (nameInput.trim() || previewHandle).trim();
  const previewLetter = previewName.charAt(0).toUpperCase() || '?';
  const previewPath = creatorPath(previewHandle);

  const handleSubmit = async (event: FormEvent) => {
    await onClaim(event);
  };

  const handleClose = () => {
    clearMessage();
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop claim-handle-modal-backdrop" onClick={handleClose} role="presentation">
      <div
        ref={cardRef}
        className="claim-handle-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-heading`}
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="modal-close-btn" onClick={handleClose} aria-label={t('studioPanel.close')}>
          &times;
        </button>

        <header className="claim-handle-modal-head">
          <h2 id={`${formId}-heading`}>
            <PixelIcon name="sparkle" size={16} /> {t('creatorProfile.publishGateTitle')}
          </h2>
          <p>{t('creatorProfile.publishNudge')}</p>
          <p className="claim-handle-modal-aside">{t('creatorProfile.editorNeeded')}</p>
        </header>

        {status === 'loading' ? <p className="creator-profile-editor-quiet">{t('creatorProfile.loading')}</p> : null}
        {status === 'error' ? (
          <p className="creator-profile-editor-quiet studio-error">{t('creatorProfile.error')}</p>
        ) : null}

        {status === 'ready' || status === 'saving' ? (
          <div className="claim-handle-modal-body">
            <form className="creator-profile-form" onSubmit={(event) => void handleSubmit(event)}>
              <label className="creator-profile-field">
                <span>{t('creatorProfile.handleLabel')}</span>
                <div className="creator-profile-handle-row">
                  <span className="creator-profile-at" aria-hidden>
                    @
                  </span>
                  <input
                    className="creator-profile-input"
                    value={handleInput}
                    onChange={(event) => setHandleInput(event.target.value.toLowerCase())}
                    autoComplete="username"
                    spellCheck={false}
                    maxLength={24}
                    pattern="[a-z][a-z0-9_]{2,23}"
                    required
                    autoFocus
                  />
                </div>
                <span className="creator-profile-hint">{t('creatorProfile.handleHint')}</span>
                {availability && !availability.available ? (
                  <span className="creator-profile-avail is-taken">{refusalCopy(availability.reason ?? 'taken')}</span>
                ) : null}
                {availability?.available ? (
                  <span className="creator-profile-avail is-free">{t('creatorProfile.available')}</span>
                ) : null}
              </label>
              <div className="creator-profile-form-actions">
                <button type="submit" className="primary-btn" disabled={status === 'saving'}>
                  {t('creatorProfile.claimHandle')}
                </button>
              </div>
            </form>

            <aside className="creator-profile-preview" aria-label={t('creatorProfile.previewAria')}>
              <p className="creator-profile-preview-kicker">{t('creatorProfile.previewKicker')}</p>
              <div className="creator-profile-preview-card">
                <span className="creator-profile-preview-letter" aria-hidden>
                  {previewLetter}
                </span>
                <div className="creator-profile-preview-meta">
                  <p className="creator-profile-preview-name">{previewName}</p>
                  <p className="creator-profile-preview-handle">@{previewHandle}</p>
                  <p className="creator-profile-preview-path">{previewPath}</p>
                </div>
              </div>
            </aside>

            {message ? (
              <p className="creator-profile-message" role="status">
                {message}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
