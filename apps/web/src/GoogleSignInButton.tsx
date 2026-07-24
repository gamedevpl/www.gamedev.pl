import { useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';

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
  const [scriptLoaded, setScriptLoaded] = useState(false);

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
    script.onerror = () => onError?.('Failed to load Google Identity Services');
    document.body.appendChild(script);
  }, [onError]);

  useEffect(() => {
    if (!scriptLoaded || !buttonRef.current || !window.google?.accounts?.id) {
      return;
    }

    const clientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string) || undefined;

    window.google.accounts.id.initialize({
      client_id: clientId,
      auto_select: true,
      callback: async (response) => {
        try {
          await signInWithGoogleToken(response.credential);
          onSuccess?.();
        } catch (err) {
          window.google?.accounts?.id?.disableAutoSelect();
          const message = err instanceof Error ? err.message : 'Sign in failed';
          onError?.(message, response.credential);
        }
      },
    });

    buttonRef.current.innerHTML = '';
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
    });
    window.google.accounts.id.prompt();
  }, [scriptLoaded, signInWithGoogleToken, onSuccess, onError]);

  return <div ref={buttonRef} className="google-sign-in-container" />;
}
