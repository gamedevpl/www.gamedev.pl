import { useEffect, useId, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useStudioCreatorProfile } from './studioCreatorProfile.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath } from './router.js';

/**
 * Claim a public handle at the publish moment — not as Studio page chrome.
 * Must render under StudioCreatorProfileProvider.
 */
export function ClaimHandleModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const formId = useId();
  const { me, status, handleInput, availability, message, setHandleInput, onClaim, refusalCopy, clearMessage } =
    useStudioCreatorProfile();

  useEffect(() => {
    if (isOpen && me?.publishReady) onClose();
  }, [isOpen, me?.publishReady, onClose]);

  if (!isOpen) return null;

  const previewHandle = (handleInput.trim() || 'you').toLowerCase();
  const previewPath = creatorPath(previewHandle);

  const handleSubmit = async (event: FormEvent) => {
    await onClaim(event);
  };

  const handleClose = () => {
    clearMessage();
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={handleClose} role="presentation">
      <div
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
                  {previewHandle.charAt(0).toUpperCase() || '?'}
                </span>
                <div className="creator-profile-preview-meta">
                  <p className="creator-profile-preview-name">{previewHandle}</p>
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
