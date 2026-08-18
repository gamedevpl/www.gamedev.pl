import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AccountDeletionControl } from './AccountDeletionControl.js';
import { PixelIcon } from './PixelIcon.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { StudioOAuthClientsPanel } from './StudioOAuthClientsPanel.js';

type AccountSettingsSection = 'credentials' | 'account';

/** Account settings remain reachable even before a creator claims a public handle. */
export function AccountSettingsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const headingId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [section, setSection] = useState<AccountSettingsSection>('credentials');

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

  const credentialsPanelId = `${headingId}-panel-credentials`;
  const accountPanelId = `${headingId}-panel-account`;

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

        <div className="account-settings-body">
          <nav className="account-settings-nav" aria-orientation="vertical">
            <button
              type="button"
              role="tab"
              id={`${headingId}-tab-credentials`}
              className={`account-settings-nav-item${section === 'credentials' ? ' is-active' : ''}`}
              aria-selected={section === 'credentials'}
              aria-controls={credentialsPanelId}
              onClick={() => setSection('credentials')}
            >
              <PixelIcon name="lock" size={14} />
              {t('creatorProfile.accountNavCredentials')}
            </button>
            <button
              type="button"
              role="tab"
              id={`${headingId}-tab-account`}
              className={`account-settings-nav-item${section === 'account' ? ' is-active' : ''}`}
              aria-selected={section === 'account'}
              aria-controls={accountPanelId}
              onClick={() => setSection('account')}
            >
              <PixelIcon name="trash" size={14} />
              {t('creatorProfile.accountNavAccount')}
            </button>
          </nav>

          {section === 'credentials' ? (
            <div
              className="account-settings-panel"
              role="tabpanel"
              id={credentialsPanelId}
              aria-labelledby={`${headingId}-tab-credentials`}
            >
              <p className="studio-rail-credentials-hint">{t('studioPanel.rail.credentialsHint')}</p>
              <div className="studio-rail-credentials-body">
                <StudioCreatorAgentKeyPanel />
                <StudioOAuthClientsPanel />
              </div>
            </div>
          ) : (
            <div
              className="account-settings-panel"
              role="tabpanel"
              id={accountPanelId}
              aria-labelledby={`${headingId}-tab-account`}
            >
              <AccountDeletionControl labelledBy={`${headingId}-danger`} />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
