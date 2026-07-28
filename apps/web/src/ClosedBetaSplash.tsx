import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppleSignInButton } from './AppleSignInButton.js';
import { useAuth } from './AuthContext.js';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { InteractiveMascot } from './Mascot.js';

type WaitlistState = 'idle' | 'joining' | 'joined' | 'error';

export function ClosedBetaSplash() {
  const { t, i18n } = useTranslation();
  const { joinWaitlist, waitlistStatus } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  // Which button produced `idToken`. The waitlist re-verifies it server-side, and the two
  // providers' tokens are not interchangeable — sending an Apple token to the Google
  // verifier would reject the very person the waitlist exists to catch.
  const [idTokenProvider, setIdTokenProvider] = useState<'google' | 'apple'>('google');
  const [waitlistState, setWaitlistState] = useState<WaitlistState>('idle');
  const isBlocked = error != null;

  const handleJoinWaitlist = async () => {
    if (!idToken || waitlistState === 'joining' || waitlistState === 'joined') return;
    setWaitlistState('joining');
    try {
      await joinWaitlist(idToken, i18n.language, idTokenProvider);
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
        <InteractiveMascot
          className="beta-splash__mascot"
          idleEmotion="wave"
          reactsToTilt
          size={96}
          pokeLabel={t('mascot.poke')}
        />
        <div className="beta-splash__logo">
          <span className="beta-splash__logo-main">gamedev</span>
          <span className="beta-splash__logo-tld">.pl</span>
        </div>

        <h1 className="beta-splash__headline">{t('betaSplash.headline')}</h1>
        <p className="beta-splash__sub">{t('betaSplash.sub')}</p>

        <div className="beta-splash__badge">{t('betaSplash.badge')}</div>

        {isBlocked && (
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
        )}

        <div className="beta-splash__signin">
          <GoogleSignInButton
            onError={(msg, token) => {
              setError(msg);
              setIdToken(token ?? null);
              setIdTokenProvider('google');
            }}
          />
          <AppleSignInButton
            onError={(msg, token) => {
              setError(msg);
              setIdToken(token ?? null);
              setIdTokenProvider('apple');
            }}
          />
        </div>

        <p className="beta-splash__footer">{t('betaSplash.footer')}</p>

        {/* The splash is the whole site for anyone not signed in, and signing in is the
            moment personal data starts being collected — so this is where the terms and
            the privacy policy have to be reachable, not one screen further in. */}
        <nav className="beta-splash__legal" aria-label={t('footer.legalNav')}>
          <a href="/terms">{t('legal.terms')}</a>
          <a href="/privacy">{t('legal.privacy')}</a>
        </nav>
      </div>
    </div>
  );
}
