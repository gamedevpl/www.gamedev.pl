import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { Mascot } from './Mascot.js';
import { PixelIcon } from './PixelIcon.js';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

export function AuthModal({ isOpen, onClose, title, subtitle }: AuthModalProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Portalled to the body because one of the two call sites renders this inside
  // <header>, which carries a backdrop-filter. That makes the header the containing
  // block for position:fixed descendants, so the backdrop was clamped to the header's
  // 61px and the card — including its close button — was laid out above the top of
  // the screen, unreachable. A portal fixes it at the source and keeps any future
  // filtered or transformed ancestor from doing the same thing again.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="auth-modal-header">
          <Mascot className="auth-modal-mascot" emotion="proud" size={56} title={t('mascot.proudAlt')} />
          <h2>
            <PixelIcon name="lock" size={18} /> {title ?? t('auth.authWallTitle')}
          </h2>
          <p>{subtitle ?? t('auth.authWallSubtitle')}</p>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <div className="auth-modal-body">
          <GoogleSignInButton onSuccess={onClose} onError={(errMsg) => setError(errMsg)} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
