import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id?: string;
            auto_select?: boolean;
            callback: (res: { credential: string }) => void;
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  // idToken is passed alongside a sign-in error (e.g. private-beta 403) so a
  // caller can offer a follow-up action — like joining the waitlist — that
  // re-verifies the same token server-side without asking the user to sign in twice.
  onError?: (err: string, idToken?: string) => void;
}

/**
 * Official four-color Google "G" on a white square — required by the Sign in with
 * Google branding guidelines for any custom (non-GIS-rendered) button face.
 */
function GoogleMark() {
  return (
    <span className="google-sign-in-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" width="18" height="18" focusable="false">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
      </svg>
    </span>
  );
}

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
  const { t, i18n } = useTranslation();
  const { signInWithGoogleToken } = useAuth();
  const buttonRef = useRef<HTMLDivElement>(null);
  const rendered = useRef(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // Callers pass inline lambdas (ClosedBetaSplash, AuthModal). Putting those in the
  // GIS effect deps cleared the button on every parent re-render — empty flash, then
  // paint again — which shoved the Apple button below it. Same for the auth context
  // function, which is recreated whenever AuthProvider updates (e.g. waitlist status
  // after a rejected One Tap). Hold the latest values in refs and init GIS once.
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  const signInRef = useRef(signInWithGoogleToken);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;
  signInRef.current = signInWithGoogleToken;

  useEffect(() => {
    if (window.google?.accounts?.id) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => onErrorRef.current?.('Failed to load Google Identity Services');
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !buttonRef.current || !window.google?.accounts?.id || rendered.current) {
      return;
    }
    rendered.current = true;

    const clientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string) || undefined;
    // GIS locale tags are BCP-47 with underscore (en_US); i18n gives "en" / "pl".
    const locale = i18n.language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: true,
      callback: async (response) => {
        try {
          await signInRef.current(response.credential);
          onSuccessRef.current?.();
        } catch (err) {
          window.google?.accounts?.id?.disableAutoSelect?.();
          const message = err instanceof Error ? err.message : 'Sign in failed';
          onErrorRef.current?.(message, response.credential);
        }
      },
    });

    // The real GIS widget stays opacity:0 over our black face. Clicks still hit Google's
    // iframe (required for FedCM / ITP), but the dark-scheme white "envelope" that GIS
    // paints around filled_black never shows — that was the flash shoving Apple down.
    buttonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      locale,
      width: 240,
    });
    window.google.accounts.id.prompt();
  }, [scriptLoaded, i18n.language]);

  return (
    <div className="google-sign-in">
      {/* Visual twin of the Apple button. aria-hidden: the real control is the GIS
          iframe layered on top (opacity 0), which carries its own accessible name. */}
      <div className="google-sign-in-face" aria-hidden="true">
        <GoogleMark />
        <span>{t('auth.signInWithGoogle')}</span>
      </div>
      <div ref={buttonRef} className="google-sign-in-gis" />
    </div>
  );
}
