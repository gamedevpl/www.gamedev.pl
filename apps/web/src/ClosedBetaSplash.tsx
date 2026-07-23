import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GoogleSignInButton } from './GoogleSignInButton';

interface ClosedBetaSplashProps {
  onJoinWaitlist?: () => void;
}

export function ClosedBetaSplash({ onJoinWaitlist }: ClosedBetaSplashProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const isBlocked = error != null;

  return (
    <div className="beta-splash">
      <div className="beta-splash__card">
        <div className="beta-splash__logo">
          <span className="beta-splash__logo-main">gamedev</span>
          <span className="beta-splash__logo-tld">.pl</span>
        </div>

        <h1 className="beta-splash__headline">{t('betaSplash.headline')}</h1>
        <p className="beta-splash__sub">{t('betaSplash.sub')}</p>

        <div className="beta-splash__badge">{t('betaSplash.badge')}</div>

        {isBlocked ? (
          <div className="beta-splash__blocked">
            <p className="beta-splash__blocked-msg">{t('betaSplash.blockedMsg')}</p>
            {onJoinWaitlist && (
              <button id="btn-join-waitlist" className="beta-splash__waitlist-btn" onClick={onJoinWaitlist}>
                {t('betaSplash.joinWaitlist')}
              </button>
            )}
          </div>
        ) : (
          <div className="beta-splash__signin">
            <GoogleSignInButton onError={(msg) => setError(msg)} />
          </div>
        )}

        <p className="beta-splash__footer">{t('betaSplash.footer')}</p>
      </div>
    </div>
  );
}
