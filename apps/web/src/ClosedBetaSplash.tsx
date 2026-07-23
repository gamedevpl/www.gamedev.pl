import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import { GoogleSignInButton } from './GoogleSignInButton';

type WaitlistState = 'idle' | 'joining' | 'joined' | 'error';

interface ClosedBetaSplashProps {
  loading?: boolean;
}

export function ClosedBetaSplash({ loading }: ClosedBetaSplashProps) {
  const { t, i18n } = useTranslation();
  const { joinWaitlist, waitlistStatus } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [waitlistState, setWaitlistState] = useState<WaitlistState>('idle');
  const isBlocked = error != null;

  const handleJoinWaitlist = async () => {
    if (!idToken || waitlistState === 'joining' || waitlistState === 'joined') return;
    setWaitlistState('joining');
    try {
      await joinWaitlist(idToken, i18n.language);
      setWaitlistState('joined');
    } catch {
      setWaitlistState('error');
    }
  };

  // Determine if we should show a known waitlist status (from the API 403 or a previous join)
  const hasKnownStatus = waitlistStatus === 'pending' || waitlistStatus === 'approved' || waitlistStatus === 'rejected';

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

        {loading ? (
          <div className="beta-splash__loading">
            <div className="beta-splash__spinner" />
          </div>
        ) : isBlocked ? (
          <div className="beta-splash__blocked">
            <p className="beta-splash__blocked-msg">{t('betaSplash.blockedMsg')}</p>
            {waitlistState === 'joined' || (hasKnownStatus && waitlistState !== 'error') ? (
              <div className="beta-splash__status">
                {(waitlistStatus === 'pending' || waitlistState === 'joined') && (
                  <p className="beta-splash__waitlist-confirm">{t('betaSplash.waitlistPending')}</p>
                )}
                {waitlistStatus === 'approved' && (
                  <p className="beta-splash__waitlist-confirm">{t('betaSplash.waitlistApproved')}</p>
                )}
                {waitlistStatus === 'rejected' && (
                  <p className="beta-splash__waitlist-rejected">{t('betaSplash.waitlistRejected')}</p>
                )}
              </div>
            ) : (
              <button
                id="btn-join-waitlist"
                className="beta-splash__waitlist-btn"
                onClick={handleJoinWaitlist}
                disabled={waitlistState === 'joining'}
              >
                {waitlistState === 'joining' ? t('betaSplash.joiningWaitlist') : t('betaSplash.joinWaitlist')}
              </button>
            )}
            {waitlistState === 'error' && (
              <p className="beta-splash__waitlist-error">{t('betaSplash.waitlistError')}</p>
            )}
          </div>
        ) : (
          <div className="beta-splash__signin">
            <GoogleSignInButton
              onError={(msg, token) => {
                setError(msg);
                setIdToken(token ?? null);
              }}
            />
          </div>
        )}

        <p className="beta-splash__footer">{t('betaSplash.footer')}</p>
      </div>
    </div>
  );
}
