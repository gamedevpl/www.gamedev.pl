import type { WaitlistStatus as SharedWaitlistStatus } from '@gamedevpl/contract';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { clearCachedCatalogSortPayload } from './recommendationsApi.js';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  tier: 'standard' | 'trusted' | 'blocked';
  /**
   * Present, and true, only for an operator on a browser session.
   *
   * Not authorization — every operator route re-checks the allowlist itself, and a
   * client that set this by hand would gain nothing but a link to a page that answers
   * "not found". It exists so the app can decide whether to *offer* the console without
   * asking an operator-only endpoint and reading its 404 as "no", which cost everybody
   * else a console error on every page load.
   */
  admin?: boolean;
  // Reviewer desk hint only; routes re-check the allowlist.
  reviewer?: boolean;
  /** Public handle when claimed — required to publish, never the Google/Apple name. */
  handle?: string;
  profileName?: string;
  bio?: string;
  avatarMode?: 'google' | 'letter';
  profileCreatedAt?: string;
  handleChangedAt?: string;
}

export type WaitlistStatus = SharedWaitlistStatus | 'unknown' | 'not_on_list';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Whether the API is running in private-beta mode (all data routes require a
  // session). Learned from the always-public /api/health so the web app can
  // decide whether an anonymous visitor sees the closed-beta splash or the
  // normal public-reads app. Defaults to false (open) until known.
  privateBeta: boolean;
  // Published slugs that remain playable from external links during closed beta.
  publicPlaySlugs: string[];
  /**
   * Whether the API can verify an Apple ID token. Learned from /api/health rather than
   * assumed, so a build carrying a Services ID never shows the button in front of a
   * server that would answer 503.
   */
  appleSignIn: boolean;
  waitlistStatus: WaitlistStatus;
  showBetaWelcome: boolean;
  signInWithGoogleToken: (idToken: string, inviteCode?: string) => Promise<void>;
  /**
   * `name` is Apple's first-authorization gift: it arrives once, outside the token, and
   * never again. Passing it through on that one sign-in is the only chance to record it.
   */
  signInWithAppleToken: (idToken: string, name?: string, inviteCode?: string) => Promise<void>;
  // Closed-beta waitlist: works without a session (the caller is by definition
  // not on the allowlist). Re-verifies the same ID token server-side.
  joinWaitlist: (idToken: string, locale?: string, provider?: 'google' | 'apple') => Promise<void>;
  acceptBetaInvite: (code: string) => Promise<void>;
  dismissBetaWelcome: () => void;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<{ deleteAfter: string }>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  privateBeta: false,
  publicPlaySlugs: [],
  appleSignIn: false,
  waitlistStatus: 'unknown',
  showBetaWelcome: false,
  signInWithGoogleToken: async () => {},
  signInWithAppleToken: async () => {},
  joinWaitlist: async () => {},
  acceptBetaInvite: async () => {},
  dismissBetaWelcome: () => {},
  logout: async () => {},
  deleteAccount: async () => ({ deleteAfter: '' }),
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [privateBeta, setPrivateBeta] = useState(false);
  const [publicPlaySlugs, setPublicPlaySlugs] = useState<string[]>([]);
  const [appleSignIn, setAppleSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waitlistStatus, setWaitlistStatus] = useState<WaitlistStatus>('unknown');
  const [showBetaWelcome, setShowBetaWelcome] = useState(false);

  const refreshUser = async () => {
    try {
      const [meRes, healthRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'include' }),
        fetch('/api/health'),
      ]);

      if (meRes.ok) {
        const data = await meRes.json();
        setUser(data.user);
      } else {
        setUser(null);
      }

      if (healthRes.ok) {
        const health = (await healthRes.json()) as {
          privateBeta?: boolean;
          appleSignIn?: boolean;
          publicPlaySlugs?: unknown;
        };
        setPrivateBeta(health.privateBeta === true);
        setAppleSignIn(health.appleSignIn === true);
        setPublicPlaySlugs(
          Array.isArray(health.publicPlaySlugs)
            ? health.publicPlaySlugs.filter((slug): slug is string => typeof slug === 'string')
            : [],
        );
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const signInWithGoogleToken = async (idToken: string, inviteCode?: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken, ...(inviteCode ? { inviteCode } : {}) }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; waitlistStatus?: string } | null;
      if (err?.waitlistStatus) {
        setWaitlistStatus(err.waitlistStatus as WaitlistStatus);
      }
      throw new Error(err?.error ?? 'Sign in failed');
    }

    const data = (await res.json()) as { user: User; betaWelcome?: boolean };
    setUser(data.user);
    setShowBetaWelcome(data.betaWelcome === true);
  };

  const signInWithAppleToken = async (idToken: string, name?: string, inviteCode?: string) => {
    const res = await fetch('/api/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken, name, ...(inviteCode ? { inviteCode } : {}) }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; waitlistStatus?: string } | null;
      if (err?.waitlistStatus) {
        setWaitlistStatus(err.waitlistStatus as WaitlistStatus);
      }
      throw new Error(err?.error ?? 'Sign in failed');
    }

    const data = (await res.json()) as { user: User; betaWelcome?: boolean };
    setUser(data.user);
    setShowBetaWelcome(data.betaWelcome === true);
  };

  const joinWaitlist = async (idToken: string, locale?: string, provider?: 'google' | 'apple') => {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, locale, provider }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? 'Failed to join waitlist');
    }

    const data = (await res.json()) as { status: string; waitlistStatus?: string };
    if (data.waitlistStatus) {
      setWaitlistStatus(data.waitlistStatus as WaitlistStatus);
    } else {
      setWaitlistStatus('pending');
    }
  };

  const acceptBetaInvite = async (code: string) => {
    const res = await fetch('/api/beta-invites/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? 'Could not accept beta invite');
    }
  };

  const dismissBetaWelcome = () => {
    setShowBetaWelcome(false);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    clearCachedCatalogSortPayload();
    setUser(null);
    setShowBetaWelcome(false);
  };

  const deleteAccount = async () => {
    const res = await fetch('/api/me/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ confirmation: 'DELETE' }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? 'Account deletion failed');
    }
    const result = (await res.json()) as { deleteAfter: string };
    clearCachedCatalogSortPayload();
    setUser(null);
    setShowBetaWelcome(false);
    return result;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        privateBeta,
        publicPlaySlugs,
        appleSignIn,
        waitlistStatus,
        showBetaWelcome,
        signInWithGoogleToken,
        signInWithAppleToken,
        joinWaitlist,
        acceptBetaInvite,
        dismissBetaWelcome,
        logout,
        deleteAccount,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
