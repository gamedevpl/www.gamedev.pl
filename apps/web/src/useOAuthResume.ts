import { useEffect, useState } from 'react';
import type { User } from './AuthContext.js';
import { navigateToOAuthReturn, parseOAuthReturnParam } from './oauthRedirect.js';

export type OAuthResumeUser = User & { tokenSession?: boolean };

type ResumeWindow = Pick<Window, 'location' | 'history'>;

export function clearOAuthReturnParam(win: ResumeWindow): void {
  const url = new URL(win.location.href);
  url.searchParams.delete('oauth_return');
  win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

export function useOAuthResume(
  authLoading: boolean,
  user: OAuthResumeUser | null,
  openSignIn: (open: boolean) => void,
): boolean {
  const [refused, setRefused] = useState(false);
  useEffect(() => {
    if (authLoading) return;
    const oauthReturn = parseOAuthReturnParam(window.location.search);
    if (!oauthReturn) return;
    if (!user) {
      openSignIn(true);
      return;
    }
    if (user.tokenSession) {
      clearOAuthReturnParam(window);
      setRefused(true);
      return;
    }
    navigateToOAuthReturn(oauthReturn, window.location);
  }, [authLoading, user, openSignIn]);
  return refused;
}
