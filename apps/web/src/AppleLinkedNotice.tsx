import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';

const VISIBLE_MS = 8000;

// Confirms the Apple ID now signs into this account.
export function AppleLinkedNotice() {
  const { t } = useTranslation();
  const { appleLinked, dismissAppleLinked } = useAuth();

  useEffect(() => {
    if (!appleLinked) return;
    const timer = setTimeout(dismissAppleLinked, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [appleLinked, dismissAppleLinked]);

  if (!appleLinked) return null;
  return (
    <div className="apple-linked-notice" role="status">
      <span>{t('auth.appleLinked')}</span>
      <button
        type="button"
        onClick={dismissAppleLinked}
        aria-label={t('catalog.exitPlayer', { defaultValue: 'Close' })}
      >
        &times;
      </button>
    </div>
  );
}
