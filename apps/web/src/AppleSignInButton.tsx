import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { platform } from './platform/index.js';

/**
 * Sign in with Apple, on the web.
 *
 * Required beside Google by App Store guideline 4.8 before the M2 store apps can ship,
 * and offered on the web rather than app-only so an Apple-account creator can still reach
 * their games from a desktop browser (mobile-app-plan.md in the private ops repo, open question 2).
 *
 * Unlike Google's widget this draws its own button. Apple's HIG permits that as long as
 * the mark, the wording and the proportions are theirs, and it is what lets the control
 * match the height and shape of the Google button beside it instead of sitting 4px off.
 */

interface AppleSignInButtonProps {
  onSuccess?: () => void;
  inviteCode?: string;
  // Mirrors GoogleSignInButton: the token travels with the error so a caller can offer
  // the waitlist without making a rejected user authenticate a second time.
  onError?: (err: string, idToken?: string) => void;
}

export function AppleSignInButton({ onSuccess, onError, inviteCode }: AppleSignInButtonProps) {
  const { t } = useTranslation();
  const { signInWithAppleToken, appleSignIn } = useAuth();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const initialized = useRef(false);

  const servicesId = (import.meta.env.VITE_APPLE_SERVICES_ID as string) || '';
  // Both halves must agree: a Services ID baked into this build, and an API that says it
  // holds the matching audience. Either alone produces a button that cannot complete.
  const enabled = servicesId !== '' && appleSignIn;

  useEffect(() => {
    if (!enabled) return;
    if (platform.auth.apple.isSdkLoaded()) {
      setReady(true);
      return;
    }
    platform.auth.apple.loadSdk(
      () => setReady(true),
      () => onError?.('Failed to load Sign in with Apple'),
    );
  }, [enabled, onError]);

  useEffect(() => {
    if (!ready || initialized.current || !platform.auth.apple.isSdkLoaded()) return;
    initialized.current = true;

    platform.auth.apple.init({
      clientId: servicesId,
      scope: 'name email',
      // Apple validates this against the Return URLs registered on the Services ID and
      // refuses anything else, including any http:// origin — which is why this flow
      // cannot be exercised from localhost. `usePopup` still requires it to be present.
      redirectURI: `${window.location.origin}/`,
      usePopup: true,
    });
  }, [ready, servicesId]);

  const handleClick = useCallback(async () => {
    if (!platform.auth.apple.isSdkLoaded() || busy) return;
    setBusy(true);
    try {
      const response = await platform.auth.apple.signIn();
      const idToken = response.authorization?.id_token;
      if (!idToken) {
        onError?.('Sign in failed');
        return;
      }

      const first = response.user?.name?.firstName ?? '';
      const last = response.user?.name?.lastName ?? '';
      const name = `${first} ${last}`.trim();

      try {
        await signInWithAppleToken(idToken, name || undefined, inviteCode);
        onSuccess?.();
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Sign in failed', idToken);
      }
    } catch (err) {
      // Apple rejects a cancelled popup as an error like any other. Closing the sheet is
      // not a failure and must not paint an error banner over the modal.
      const code = (err as { error?: string } | null)?.error;
      if (code !== 'popup_closed_by_user' && code !== 'user_cancelled_authorize') {
        onError?.('Sign in failed');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, inviteCode, onError, onSuccess, signInWithAppleToken]);

  if (!enabled) return null;

  return (
    <button type="button" className="apple-sign-in-btn" onClick={handleClick} disabled={!ready || busy}>
      <svg className="apple-sign-in-mark" viewBox="0 0 14 17" aria-hidden="true" focusable="false">
        <path
          fill="currentColor"
          d="M11.6 8.9c0-1.9 1.5-2.8 1.6-2.9-.9-1.3-2.2-1.5-2.7-1.5-1.2-.1-2.3.7-2.9.7-.6 0-1.5-.7-2.4-.7C3.9 4.5 2.7 5.2 2 6.4c-1.3 2.3-.3 5.7 1 7.6.6.9 1.4 1.9 2.3 1.9.9 0 1.3-.6 2.4-.6 1.1 0 1.4.6 2.4.6 1 0 1.6-.9 2.2-1.8.7-1 1-2 1-2.1 0 0-1.9-.8-1.9-3.1zM9.8 3.2c.5-.6.8-1.5.7-2.3-.7 0-1.6.5-2.1 1.1-.5.6-.9 1.4-.7 2.3.8 0 1.6-.4 2.1-1.1z"
        />
      </svg>
      <span>{t('auth.signInWithApple')}</span>
    </button>
  );
}
