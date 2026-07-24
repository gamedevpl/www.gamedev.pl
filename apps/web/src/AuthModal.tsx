import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PixelIcon } from './PixelIcon';

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          &times;
        </button>

        <div className="auth-modal-header">
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
    </div>
  );
}
