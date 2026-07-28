import React, { createContext, useContext, useEffect, useState } from 'react';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  tier: 'standard' | 'trusted' | 'blocked';
}

export type WaitlistStatus = 'unknown' | 'not_on_list' | 'pending' | 'approved' | 'rejected';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Whether the API is running in private-beta mode (all data routes require a
  // session). Learned from the always-public /api/health so the web app can
  // decide whether an anonymous visitor sees the closed-beta splash or the
  // normal public-reads app. Defaults to false (open) until known.
  privateBeta: boolean;
  /**
   * Whether the API can verify an Apple ID token. Learned from /api/health rather than
   * assumed, so a build carrying a Services ID never shows the button in front of a
   * server that would answer 503.
   */
  appleSignIn: boolean;
  waitlistStatus: WaitlistStatus;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  /**
   * `name` is Apple's first-authorization gift: it arrives once, outside the token, and
   * never again. Passing it through on that one sign-in is the only chance to record it.
   */
  signInWithAppleToken: (idToken: string, name?: string) => Promise<void>;
  // Closed-beta waitlist: works without a session (the caller is by definition
  // not on the allowlist). Re-verifies the same ID token server-side.
  joinWaitlist: (idToken: string, locale?: string, provider?: 'google' | 'apple') => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  privateBeta: false,
  appleSignIn: false,
  waitlistStatus: 'unknown',
  signInWithGoogleToken: async () => {},
  signInWithAppleToken: async () => {},
  joinWaitlist: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [privateBeta, setPrivateBeta] = useState(false);
  const [appleSignIn, setAppleSignIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waitlistStatus, setWaitlistStatus] = useState<WaitlistStatus>('unknown');

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
        const health = (await healthRes.json()) as { privateBeta?: boolean; appleSignIn?: boolean };
        setPrivateBeta(health.privateBeta === true);
        setAppleSignIn(health.appleSignIn === true);
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

  const signInWithGoogleToken = async (idToken: string) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; waitlistStatus?: string } | null;
      if (err?.waitlistStatus) {
        setWaitlistStatus(err.waitlistStatus as WaitlistStatus);
      }
      throw new Error(err?.error ?? 'Sign in failed');
    }

    const data = await res.json();
    setUser(data.user);
  };

  const signInWithAppleToken = async (idToken: string, name?: string) => {
    const res = await fetch('/api/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ idToken, name }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string; waitlistStatus?: string } | null;
      if (err?.waitlistStatus) {
        setWaitlistStatus(err.waitlistStatus as WaitlistStatus);
      }
      throw new Error(err?.error ?? 'Sign in failed');
    }

    const data = await res.json();
    setUser(data.user);
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

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        privateBeta,
        appleSignIn,
        waitlistStatus,
        signInWithGoogleToken,
        signInWithAppleToken,
        joinWaitlist,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
