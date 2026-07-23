import React, { createContext, useContext, useEffect, useState } from 'react';

export interface User {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  tier: 'standard' | 'trusted' | 'blocked';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Whether the API is running in private-beta mode (all data routes require a
  // session). Learned from the always-public /api/health so the web app can
  // decide whether an anonymous visitor sees the closed-beta splash or the
  // normal public-reads app. Defaults to false (open) until known.
  privateBeta: boolean;
  signInWithGoogleToken: (idToken: string) => Promise<void>;
  // Closed-beta waitlist: works without a session (the caller is by definition
  // not on the allowlist). Re-verifies the same Google ID token server-side.
  joinWaitlist: (idToken: string, locale?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  privateBeta: false,
  signInWithGoogleToken: async () => {},
  joinWaitlist: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [privateBeta, setPrivateBeta] = useState(false);
  const [loading, setLoading] = useState(true);

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
        const health = (await healthRes.json()) as { privateBeta?: boolean };
        setPrivateBeta(health.privateBeta === true);
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
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? 'Sign in failed');
    }

    const data = await res.json();
    setUser(data.user);
  };

  const joinWaitlist = async (idToken: string, locale?: string) => {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, locale }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(err?.error ?? 'Failed to join waitlist');
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, privateBeta, signInWithGoogleToken, joinWaitlist, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
