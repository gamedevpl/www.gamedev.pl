import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';

/** Destructive account action shared by profile editing and handle-less account settings. */
export function AccountDeletionControl({ labelledBy }: { labelledBy?: string }) {
  const { t } = useTranslation();
  const { deleteAccount } = useAuth();
  const dialogId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [status, setStatus] = useState<'idle' | 'deleting' | 'error'>('idle');
  const statusRef = useRef(status);
  statusRef.current = status;

  const close = useCallback(() => {
    if (statusRef.current === 'deleting') return;
    setOpen(false);
    setConfirmation('');
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || statusRef.current === 'deleting') return;
      event.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    inputRef.current?.focus();
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [close, open]);

  return (
    <>
      <section className="creator-profile-danger" aria-labelledby={labelledBy}>
        <h3 id={labelledBy}>{t('creatorProfile.accountHeading')}</h3>
        <p>{t('creatorProfile.deleteAccountSummary')}</p>
        <button type="button" className="creator-profile-delete-button" onClick={() => setOpen(true)}>
          {t('creatorProfile.deleteAccount')}
        </button>
      </section>

      {open
        ? createPortal(
            <div className="modal-backdrop account-delete-backdrop" role="presentation" onClick={close}>
              <section
                className="account-delete-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${dialogId}-heading`}
                onClick={(event) => event.stopPropagation()}
              >
                <h2 id={`${dialogId}-heading`}>{t('creatorProfile.deleteDialogTitle')}</h2>
                <p>{t('creatorProfile.deleteDialogIntro')}</p>
                <ul>
                  <li>{t('creatorProfile.deletePublished')}</li>
                  <li>{t('creatorProfile.deleteUnpublished')}</li>
                  <li>{t('creatorProfile.deletePersonalData')}</li>
                </ul>
                <label className="creator-profile-field">
                  <span>{t('creatorProfile.deleteConfirmationLabel')}</span>
                  <input
                    ref={inputRef}
                    className="creator-profile-input"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                {status === 'error' ? (
                  <p className="creator-profile-message creator-profile-error" role="alert">
                    {t('creatorProfile.deleteError')}
                  </p>
                ) : null}
                <div className="account-delete-actions">
                  <button type="button" className="secondary-btn" disabled={status === 'deleting'} onClick={close}>
                    {t('creatorProfile.deleteCancel')}
                  </button>
                  <button
                    type="button"
                    className="creator-profile-delete-confirm"
                    disabled={confirmation !== 'DELETE' || status === 'deleting'}
                    onClick={() => {
                      setStatus('deleting');
                      void deleteAccount()
                        .then(() => {
                          // Do not depend on navigation to unmount this dialog. A
                          // blocked popstate (or a host embedding the control without
                          // App routing) must not leave a permanent deleting overlay.
                          setOpen(false);
                          setConfirmation('');
                          setStatus('idle');
                          window.history.replaceState(null, '', '/');
                          window.dispatchEvent(new PopStateEvent('popstate'));
                        })
                        .catch(() => setStatus('error'));
                    }}
                  >
                    {status === 'deleting' ? t('creatorProfile.deletingAccount') : t('creatorProfile.deleteAccount')}
                  </button>
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
