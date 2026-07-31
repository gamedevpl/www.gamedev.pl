import { useEffect, useRef, useState } from 'react';
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

export function GoogleSignInButton({ onSuccess, onError }: GoogleSignInButtonProps) {
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

    buttonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      // Pinned so this button and the Sign in with Apple one below it are the same size.
      // Left to itself the widget sizes to its own label — 223px in Polish, wider in
      // English — so any width chosen for the Apple button is wrong in some locale.
      // Sizing the *container* to fit its widest child instead does not work: the widget
      // measures its parent while laying out, and a `fit-content` parent collapses it to
      // zero on a cold load (it survives an HMR patch, which is how that nearly shipped).
      width: 240,
    });
    window.google.accounts.id.prompt();
  }, [scriptLoaded]);

  // Width/height reserved in CSS before GIS paints — see `.google-sign-in-container`.
  return <div ref={buttonRef} className="google-sign-in-container" />;
}
