import { useEffect, useId, useRef, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AccountDeletionControl } from './AccountDeletionControl.js';
import { useStudioCreatorProfile } from './studioCreatorProfile.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath } from './core/router.js';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Edit display name / bio / avatar / handle — modal, not Studio page chrome.
 * Must render under StudioCreatorProfileProvider.
 */
export function EditProfileModal({
  isOpen,
  onClose,
  onSaved,
  onHandleChanged,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** After a successful details save (name/bio/avatar). */
  onSaved?: () => void;
  /** After a successful handle rename — parent should navigate to the new URL. */
  onHandleChanged?: (handle: string) => void;
}) {
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
    bioInput,
    avatarMode,
    availability,
    message,
    setHandleInput,
    setNameInput,
    setBioInput,
    setAvatarMode,
    onClaim,
    onSaveDetails,
    refusalCopy,
    clearMessage,
  } = useStudioCreatorProfile();

  onCloseRef.current = onClose;
  clearMessageRef.current = clearMessage;

  // Only re-bind when the dialog opens/closes — not on every keystroke — or cleanup
  // restores focus to the opener mid-edit.
  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.account-delete-dialog')) return;
        event.preventDefault();
        clearMessageRef.current();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const root = cardRef.current;
      if (!root) return;
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

  const previewHandle = (handleInput.trim() || me?.handle || 'you').toLowerCase();
  const previewName = (nameInput.trim() || me?.profileName || previewHandle).trim();
  const previewLetter = previewName.charAt(0).toUpperCase() || '?';
  const showGoogleAvatar = avatarMode === 'google' && Boolean(me?.picture);
  const previewPath = creatorPath(previewHandle);

  const handleClose = () => {
    clearMessage();
    onClose();
  };

  const handleSave = async (event: FormEvent) => {
    const ok = await onSaveDetails(event);
    if (ok) {
      onSaved?.();
      onClose();
    }
  };

  const handleRename = async (event: FormEvent) => {
    const previous = me?.handle;
    const next = await onClaim(event);
    if (!next?.handle) return;
    if (next.handle !== previous) {
      onHandleChanged?.(next.handle);
    } else {
      onSaved?.();
    }
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop claim-handle-modal-backdrop" onClick={handleClose} role="presentation">
      <div
        ref={cardRef}
        className="claim-handle-modal-card edit-profile-modal-card"
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
            <PixelIcon name="user" size={16} /> {t('creatorProfile.editorTitle')}
          </h2>
          <p>{t('creatorProfile.editorReady')}</p>
        </header>

        {status === 'loading' ? <p className="creator-profile-editor-quiet">{t('creatorProfile.loading')}</p> : null}
        {status === 'error' ? (
          <p className="creator-profile-editor-quiet studio-error">{t('creatorProfile.error')}</p>
        ) : null}

        {status === 'ready' || status === 'saving' ? (
          <div className="edit-profile-modal-body">
            <div className="creator-profile-editor-forms">
              <form className="creator-profile-form" onSubmit={(event) => void handleSave(event)}>
                <label className="creator-profile-field">
                  <span>{t('creatorProfile.nameLabel')}</span>
                  <input
                    className="creator-profile-input"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    maxLength={40}
                    required
                    autoFocus
                  />
                </label>
                <label className="creator-profile-field">
                  <span>{t('creatorProfile.bioLabel')}</span>
                  <textarea
                    className="creator-profile-input creator-profile-bio-input"
                    value={bioInput}
                    onChange={(event) => setBioInput(event.target.value)}
                    maxLength={280}
                    rows={2}
                  />
                </label>
                <fieldset className="creator-profile-avatar-field">
                  <legend>{t('creatorProfile.avatarLabel')}</legend>
                  <label>
                    <input
                      type="radio"
                      name="avatarMode"
                      checked={avatarMode === 'google'}
                      onChange={() => setAvatarMode('google')}
                      disabled={!me?.picture}
                    />{' '}
                    {t('creatorProfile.avatarGoogle')}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="avatarMode"
                      checked={avatarMode === 'letter'}
                      onChange={() => setAvatarMode('letter')}
                    />{' '}
                    {t('creatorProfile.avatarLetter')}
                  </label>
                </fieldset>
                <div className="creator-profile-form-actions">
                  <button type="submit" className="primary-btn" disabled={status === 'saving'}>
                    {t('creatorProfile.save')}
                  </button>
                  {me?.handle ? (
                    <a className="creator-profile-text-link" href={creatorPath(me.handle)}>
                      {t('creatorProfile.viewPublic')}
                    </a>
                  ) : null}
                </div>
              </form>

              <details className="creator-profile-rename">
                <summary>{t('creatorProfile.renameHandle')}</summary>
                <form className="creator-profile-form" onSubmit={(event) => void handleRename(event)}>
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
                      />
                    </div>
                    <span className="creator-profile-hint">{t('creatorProfile.handleHint')}</span>
                    <span className="creator-profile-hint creator-profile-rename-warning">
                      {t('creatorProfile.renameWarning')}
                    </span>
                    {availability && !availability.available ? (
                      <span className="creator-profile-avail is-taken">
                        {refusalCopy(availability.reason ?? 'taken')}
                      </span>
                    ) : null}
                    {availability?.available ? (
                      <span className="creator-profile-avail is-free">{t('creatorProfile.available')}</span>
                    ) : null}
                  </label>
                  <div className="creator-profile-form-actions">
                    <button type="submit" className="secondary-btn" disabled={status === 'saving'}>
                      {t('creatorProfile.renameHandle')}
                    </button>
                  </div>
                </form>
              </details>

              <AccountDeletionControl labelledBy={`${formId}-account-heading`} />

              {message ? (
                <p className="creator-profile-message" role="status">
                  {message}
                </p>
              ) : null}
            </div>

            <aside className="creator-profile-preview" aria-label={t('creatorProfile.previewAria')}>
              <p className="creator-profile-preview-kicker">{t('creatorProfile.previewKicker')}</p>
              <div className="creator-profile-preview-card">
                {showGoogleAvatar ? (
                  <img className="creator-profile-preview-avatar" src={me!.picture!} alt="" width={40} height={40} />
                ) : (
                  <span className="creator-profile-preview-letter" aria-hidden>
                    {previewLetter}
                  </span>
                )}
                <div className="creator-profile-preview-meta">
                  <p className="creator-profile-preview-name">{previewName}</p>
                  <p className="creator-profile-preview-handle">@{previewHandle}</p>
                  <p className="creator-profile-preview-path">{previewPath}</p>
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
