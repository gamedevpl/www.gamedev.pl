import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import {
  checkHandleAvailability,
  claimHandle,
  fetchMyProfile,
  updateMyProfile,
  type AvatarMode,
  type HandleClaimError,
  type MeProfile,
} from './creatorProfileApi.js';

type ProfileStatus = 'loading' | 'ready' | 'saving' | 'error';

export type StudioCreatorProfile = {
  me: MeProfile | null;
  status: ProfileStatus;
  handleInput: string;
  nameInput: string;
  bioInput: string;
  avatarMode: AvatarMode;
  availability: { available: boolean; reason?: HandleClaimError } | null;
  message: string | null;
  setHandleInput: (value: string) => void;
  setNameInput: (value: string) => void;
  setBioInput: (value: string) => void;
  setAvatarMode: (value: AvatarMode) => void;
  onClaim: (event: FormEvent) => Promise<void>;
  onSaveDetails: (event: FormEvent) => Promise<void>;
  refusalCopy: (code: HandleClaimError) => string;
  clearMessage: () => void;
};

const StudioCreatorProfileContext = createContext<StudioCreatorProfile | null>(null);

/**
 * Shared Studio profile store — chrome chip and claim modal both read/write here so a
 * claim reveals `@handle` without remounting.
 */
export function StudioCreatorProfileProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('letter');
  const [availability, setAvailability] = useState<{ available: boolean; reason?: HandleClaimError } | null>(null);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchMyProfile()
      .then((profile) => {
        if (cancelled) return;
        setMe(profile);
        setHandleInput(profile.handle ?? '');
        setNameInput(profile.profileName ?? profile.handle ?? '');
        setBioInput(profile.bio ?? '');
        setAvatarMode(profile.avatarMode ?? 'letter');
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!handleInput.trim() || (me?.handle && handleInput.trim().toLowerCase() === me.handle)) {
      setAvailability(null);
      return;
    }
    const handle = handleInput.trim().toLowerCase();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void checkHandleAvailability(handle)
        .then((result) => {
          // Ignore stale responses from a previous keystroke after the user typed again.
          if (cancelled) return;
          setAvailability({ available: result.available, reason: result.reason });
        })
        .catch(() => {
          if (!cancelled) setAvailability(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [handleInput, me?.handle]);

  const refusalCopy = (code: HandleClaimError): string => {
    switch (code) {
      case 'invalid':
        return t('creatorProfile.errors.invalid');
      case 'reserved':
        return t('creatorProfile.errors.reserved');
      case 'taken':
        return t('creatorProfile.errors.taken');
      case 'cooldown':
        return t('creatorProfile.errors.cooldown');
      case 'unchanged':
        return t('creatorProfile.errors.unchanged');
      default:
        return t('creatorProfile.errors.unknown');
    }
  };

  const applyProfile = (next: MeProfile) => {
    setMe(next);
    setHandleInput(next.handle ?? '');
    setNameInput(next.profileName ?? next.handle ?? '');
    setBioInput(next.bio ?? '');
    setAvatarMode(next.avatarMode ?? 'letter');
  };

  const onClaim = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('saving');
    setMessage(null);
    try {
      const next = await claimHandle(handleInput.trim());
      applyProfile(next);
      setMessage(t('creatorProfile.claimed'));
      setStatus('ready');
      await refreshUser();
    } catch (err) {
      const code = ((err as { code?: HandleClaimError }).code ?? 'unknown') as HandleClaimError;
      setMessage(refusalCopy(code));
      setStatus('ready');
    }
  };

  const onSaveDetails = async (event: FormEvent) => {
    event.preventDefault();
    if (!me?.handle) return;
    setStatus('saving');
    setMessage(null);
    try {
      const next = await updateMyProfile({
        profileName: nameInput.trim(),
        bio: bioInput,
        avatarMode,
      });
      applyProfile(next);
      setMessage(t('creatorProfile.saved'));
      setStatus('ready');
      await refreshUser();
    } catch {
      setMessage(t('creatorProfile.errors.unknown'));
      setStatus('ready');
    }
  };

  const value: StudioCreatorProfile = {
    me,
    status,
    handleInput,
    nameInput,
    bioInput,
    avatarMode,
    availability,
    message,
    setHandleInput,
    setNameInput,
    setBioInput,
    setAvatarMode,
    onClaim,
    onSaveDetails,
    refusalCopy,
    clearMessage: () => setMessage(null),
  };

  return <StudioCreatorProfileContext.Provider value={value}>{children}</StudioCreatorProfileContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useStudioCreatorProfile(): StudioCreatorProfile {
  const ctx = useContext(StudioCreatorProfileContext);
  if (!ctx) {
    throw new Error('useStudioCreatorProfile requires StudioCreatorProfileProvider');
  }
  return ctx;
}
