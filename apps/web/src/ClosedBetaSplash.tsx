import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppleSignInButton } from './AppleSignInButton.js';
import { useAuth } from './AuthContext.js';
import { GoogleSignInButton } from './GoogleSignInButton.js';
import { InteractiveMascot } from './Mascot.js';
import { SplashMascotGame } from './SplashMascotGame.js';
import { recordBetaInviteStep, recordWaitlistStep } from './visitTelemetry.js';

type WaitlistState = 'idle' | 'joining' | 'joined' | 'error';

export function ClosedBetaSplash({ inviteCode }: { inviteCode?: string }) {
  const { t, i18n } = useTranslation();
  const { joinWaitlist, waitlistStatus } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  // Which button produced `idToken`. The waitlist re-verifies it server-side, and the two
  // providers' tokens are not interchangeable — sending an Apple token to the Google
  // verifier would reject the very person the waitlist exists to catch.
  const [idTokenProvider, setIdTokenProvider] = useState<'google' | 'apple'>('google');
  const [waitlistState, setWaitlistState] = useState<WaitlistState>('idle');
  const isInvite = inviteCode !== undefined;
  // Clicked Join before signing in — after a rejected sign-in we auto-join with that token
  // so the visitor is not asked to press Join a second time.
  const [awaitingSignIn, setAwaitingSignIn] = useState(false);
  const joinIntentRef = useRef(false);
  const isBlocked = error != null;

  useEffect(() => {
    if (isInvite) recordBetaInviteStep('opened');
  }, [isInvite]);

  const doJoin = async (token: string, provider: 'google' | 'apple') => {
    if (waitlistState === 'joining' || waitlistState === 'joined') return;
    setWaitlistState('joining');
    setAwaitingSignIn(false);
    joinIntentRef.current = false;
    try {
      await joinWaitlist(token, i18n.language, provider);
      setWaitlistState('joined');
      recordWaitlistStep('joined');
    } catch {
      setWaitlistState('error');
    }
  };

  const handleJoinWaitlist = () => {
    if (waitlistState === 'joining' || waitlistState === 'joined') return;
    if (isInvite) {
      setAwaitingSignIn(true);
      return;
    }
    recordWaitlistStep('cta_clicked');
    if (!idToken) {
      // Still requires login: the CTA is visible up front, but the write only happens
      // after an ID token arrives from Google or Apple.
      joinIntentRef.current = true;
      setAwaitingSignIn(true);
      return;
    }
    void doJoin(idToken, idTokenProvider);
  };

  const handleSignInError = (msg: string, token: string | undefined, provider: 'google' | 'apple') => {
    setError(msg);
    setIdToken(token ?? null);
    setIdTokenProvider(provider);
    if (!isInvite && token && joinIntentRef.current) {
      void doJoin(token, provider);
    }
  };

  const handleInviteSignIn = () => {
    recordBetaInviteStep('accepted');
  };

  // Determine if we should show a known waitlist status (from the API 403 or a previous join)
  const hasKnownStatus = waitlistStatus === 'pending' || waitlistStatus === 'approved' || waitlistStatus === 'rejected';
  const showStatus = !isInvite && (waitlistState === 'joined' || (hasKnownStatus && waitlistState !== 'error'));

  return (
    <div className="beta-splash">
      <div className="beta-splash__card">
        {isInvite ? (
          <InteractiveMascot
            className="beta-splash__mascot"
            idleEmotion="wave"
            reactsToTilt
            doesPullUps
            size={96}
            pokeLabel={t('mascot.poke')}
          />
        ) : (
          <SplashMascotGame pokeLabel={t('mascot.poke')} />
        )}
        <div className="beta-splash__logo">
          <span className="beta-splash__logo-main">gamedev</span>
          <span className="beta-splash__logo-tld">.pl</span>
        </div>

        <h1 className="beta-splash__headline">{isInvite ? t('betaInvite.headline') : t('betaSplash.headline')}</h1>
        <p className="beta-splash__sub">{isInvite ? t('betaInvite.sub') : t('betaSplash.sub')}</p>

        <div className="beta-splash__badge">{t('betaSplash.badge')}</div>

        <div className="beta-splash__waitlist">
          {showStatus ? (
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
            <>
              {isBlocked && (
                <p className="beta-splash__blocked-msg">
                  {isInvite ? t('betaInvite.unavailableSub') : t('betaSplash.blockedMsg')}
                </p>
              )}
              <button
                id={isInvite ? 'btn-accept-beta-invite' : 'btn-join-waitlist'}
                className="beta-splash__waitlist-btn"
                onClick={handleJoinWaitlist}
                disabled={waitlistState === 'joining'}
              >
                {isInvite
                  ? t('betaInvite.accept')
                  : waitlistState === 'joining'
                    ? t('betaSplash.joiningWaitlist')
                    : t('betaSplash.joinWaitlist')}
              </button>
              {awaitingSignIn && !idToken && (
                <p className="beta-splash__signin-hint">
                  {isInvite ? t('betaInvite.signInHint') : t('betaSplash.signInToJoin')}
                </p>
              )}
            </>
          )}
          {waitlistState === 'error' && (
            <p className="beta-splash__waitlist-error">
              {isInvite ? t('betaInvite.unavailableSub') : t('betaSplash.waitlistError')}
            </p>
          )}
        </div>

        <div className="beta-splash__signin">
          <GoogleSignInButton
            inviteCode={inviteCode}
            onSuccess={isInvite ? handleInviteSignIn : undefined}
            onError={(msg, token) => {
              handleSignInError(msg, token, 'google');
            }}
          />
          <AppleSignInButton
            inviteCode={inviteCode}
            onSuccess={isInvite ? handleInviteSignIn : undefined}
            onError={(msg, token) => {
              handleSignInError(msg, token, 'apple');
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
