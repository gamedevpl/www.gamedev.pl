import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AccountDeletionControl } from './AccountDeletionControl.js';
import { PixelIcon } from './PixelIcon.js';
import { StudioCreatorAgentKeyPanel } from './surfaces/studio/StudioCreatorAgentKeyPanel.js';
import { StudioOAuthClientsPanel } from './surfaces/studio/StudioOAuthClientsPanel.js';

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
    if (isOpen) setSection('credentials');
  }, [isOpen]);

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

  const sections: { id: AccountSettingsSection; icon: 'lock' | 'user'; label: string }[] = [
    { id: 'account', icon: 'user', label: t('creatorProfile.accountNavAccount') },
    { id: 'credentials', icon: 'lock', label: t('creatorProfile.accountNavCredentials') },
  ];

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
          <nav className="account-settings-nav" aria-label={t('creatorProfile.accountSettings')}>
            {sections.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`account-settings-nav-item${section === entry.id ? ' is-active' : ''}`}
                aria-current={section === entry.id ? 'true' : undefined}
                data-section={entry.id}
                onClick={() => setSection(entry.id)}
              >
                <PixelIcon name={entry.icon} size={14} />
                {entry.label}
              </button>
            ))}
          </nav>

          <div className="account-settings-panel" data-section="credentials" hidden={section !== 'credentials'}>
            <p className="studio-rail-credentials-hint">{t('studioPanel.rail.credentialsHint')}</p>
            <div className="studio-rail-credentials-body">
              <StudioCreatorAgentKeyPanel />
              <StudioOAuthClientsPanel />
            </div>
          </div>

          <div className="account-settings-panel" data-section="account" hidden={section !== 'account'}>
            <AccountDeletionControl labelledBy={`${headingId}-danger`} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
