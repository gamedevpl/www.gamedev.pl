import { useEffect, useId, useState, type FormEvent } from 'react';
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
import { PixelIcon } from './PixelIcon.js';
import { creatorPath } from './router.js';

/**
 * Studio panel: claim a unique handle and edit the public byline/bio/avatar.
 * Publish is refused without a handle — this is the place that clears that gate.
 */
export function CreatorProfileEditor({ publishNudge = false }: { publishNudge?: boolean }) {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const formId = useId();
  const [me, setMe] = useState<MeProfile | null>(null);
  const [handleInput, setHandleInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [avatarMode, setAvatarMode] = useState<AvatarMode>('letter');
  const [availability, setAvailability] = useState<{ available: boolean; reason?: HandleClaimError } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading');
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
    const timer = window.setTimeout(() => {
      void checkHandleAvailability(handle)
        .then((result) => setAvailability({ available: result.available, reason: result.reason }))
        .catch(() => setAvailability(null));
    }, 300);
    return () => window.clearTimeout(timer);
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

  const onClaim = async (event: FormEvent) => {
    event.preventDefault();
    setStatus('saving');
    setMessage(null);
    try {
      const next = await claimHandle(handleInput.trim());
      setMe(next);
      setHandleInput(next.handle ?? '');
      setNameInput(next.profileName ?? next.handle ?? '');
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
      setMe(next);
      setMessage(t('creatorProfile.saved'));
      setStatus('ready');
      await refreshUser();
    } catch {
      setMessage(t('creatorProfile.errors.unknown'));
      setStatus('ready');
    }
  };

  if (status === 'loading') {
    return <p className="studio-empty">{t('creatorProfile.loading')}</p>;
  }
  if (status === 'error') {
    return <p className="studio-empty studio-error">{t('creatorProfile.error')}</p>;
  }

  const publishReady = Boolean(me?.publishReady);

  return (
    <section className="creator-profile-editor" aria-labelledby={`${formId}-heading`}>
      <header className="creator-profile-editor-head">
        <h2 id={`${formId}-heading`} className="creator-profile-editor-title">
          {t('creatorProfile.editorTitle')}
        </h2>
        <p className="creator-profile-editor-copy">
          {publishReady ? t('creatorProfile.editorReady') : t('creatorProfile.editorNeeded')}
        </p>
        {publishNudge && !publishReady ? (
          <p className="creator-profile-nudge" role="status">
            <PixelIcon name="sparkle" size={12} /> {t('creatorProfile.publishNudge')}
          </p>
        ) : null}
      </header>

      <form className="creator-profile-form" onSubmit={(event) => void onClaim(event)}>
        <label className="creator-profile-field">
          <span>{t('creatorProfile.handleLabel')}</span>
          <div className="creator-profile-handle-row">
            <span className="creator-profile-at" aria-hidden>
              @
            </span>
            <input
              className="creator-profile-input"
              value={handleInput}
              onChange={(event) => setHandleInput(event.target.value.toLowerCase())}
              autoComplete="username"
              spellCheck={false}
              maxLength={24}
              pattern="[a-z][a-z0-9_]{2,23}"
              required
            />
          </div>
          <span className="creator-profile-hint">{t('creatorProfile.handleHint')}</span>
          {availability && !availability.available ? (
            <span className="creator-profile-avail is-taken">{refusalCopy(availability.reason ?? 'taken')}</span>
          ) : null}
          {availability?.available ? (
            <span className="creator-profile-avail is-free">{t('creatorProfile.available')}</span>
          ) : null}
        </label>
        <button type="submit" className="primary-btn" disabled={status === 'saving'}>
          {me?.handle ? t('creatorProfile.renameHandle') : t('creatorProfile.claimHandle')}
        </button>
      </form>

      {me?.handle ? (
        <form className="creator-profile-form" onSubmit={(event) => void onSaveDetails(event)}>
          <label className="creator-profile-field">
            <span>{t('creatorProfile.nameLabel')}</span>
            <input
              className="creator-profile-input"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              maxLength={40}
              required
            />
          </label>
          <label className="creator-profile-field">
            <span>{t('creatorProfile.bioLabel')}</span>
            <textarea
              className="creator-profile-input creator-profile-bio-input"
              value={bioInput}
              onChange={(event) => setBioInput(event.target.value)}
              maxLength={280}
              rows={3}
            />
          </label>
          <fieldset className="creator-profile-avatar-field">
            <legend>{t('creatorProfile.avatarLabel')}</legend>
            <label>
              <input
                type="radio"
                name="avatarMode"
                checked={avatarMode === 'google'}
                onChange={() => setAvatarMode('google')}
                disabled={!me.picture}
              />{' '}
              {t('creatorProfile.avatarGoogle')}
            </label>
            <label>
              <input
                type="radio"
                name="avatarMode"
                checked={avatarMode === 'letter'}
                onChange={() => setAvatarMode('letter')}
              />{' '}
              {t('creatorProfile.avatarLetter')}
            </label>
          </fieldset>
          <div className="creator-profile-form-actions">
            <button type="submit" className="primary-btn" disabled={status === 'saving'}>
              {t('creatorProfile.save')}
            </button>
            <a className="secondary-btn" href={creatorPath(me.handle)}>
              {t('creatorProfile.viewPublic')}
            </a>
          </div>
        </form>
      ) : null}

      {message ? (
        <p className="creator-profile-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
