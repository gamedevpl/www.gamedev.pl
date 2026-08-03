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
 * Studio profile strip — quiet when a handle exists, loud only when publish needs one.
 *
 * Collapsed: `@handle · Edit profile` chip (thread keeps the first viewport).
 * Expanded: claim or edit, with a tiny preview of the public page.
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
  /** null = follow the default (open when publish needs a handle). */
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);

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
      // Hand the viewport back to the thread once the gate is clear.
      setExpandedOverride(false);
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
      setExpandedOverride(false);
      await refreshUser();
    } catch {
      setMessage(t('creatorProfile.errors.unknown'));
      setStatus('ready');
    }
  };

  if (status === 'loading') {
    return (
      <div className="creator-profile-editor is-loading" aria-busy="true">
        <p className="creator-profile-editor-quiet">{t('creatorProfile.loading')}</p>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="creator-profile-editor is-error">
        <p className="creator-profile-editor-quiet studio-error">{t('creatorProfile.error')}</p>
      </div>
    );
  }

  const publishReady = Boolean(me?.publishReady);
  const needsHandle = !publishReady;
  const defaultExpanded = needsHandle;
  const expanded = expandedOverride ?? defaultExpanded;

  const previewHandle = (handleInput.trim() || me?.handle || 'you').toLowerCase();
  const previewName = (nameInput.trim() || me?.profileName || previewHandle).trim();
  const previewLetter = previewName.charAt(0).toUpperCase() || '?';
  const showGoogleAvatar = avatarMode === 'google' && Boolean(me?.picture);
  const previewPath = creatorPath(previewHandle);

  if (!expanded) {
    return (
      <section className="creator-profile-editor is-collapsed" aria-label={t('creatorProfile.editorTitle')}>
        {publishReady && me?.handle ? (
          <div className="creator-profile-chip-row">
            <button
              type="button"
              className="creator-profile-chip"
              onClick={() => setExpandedOverride(true)}
              aria-expanded={false}
            >
              <span className="creator-profile-chip-letter" aria-hidden>
                {(me.profileName || me.handle).charAt(0).toUpperCase()}
              </span>
              <span className="creator-profile-chip-label">
                @{me.handle}
                <span className="creator-profile-chip-sep">·</span>
                {t('creatorProfile.editProfile')}
              </span>
            </button>
            <a className="creator-profile-chip-link" href={creatorPath(me.handle)}>
              {t('creatorProfile.viewPublic')}
            </a>
          </div>
        ) : (
          <button
            type="button"
            className="creator-profile-chip creator-profile-chip--claim"
            onClick={() => setExpandedOverride(true)}
            aria-expanded={false}
          >
            <PixelIcon name="user" size={12} />
            {publishNudge ? t('creatorProfile.publishNudgeShort') : t('creatorProfile.claimChip')}
          </button>
        )}
      </section>
    );
  }

  return (
    <section
      className={`creator-profile-editor is-expanded${needsHandle ? ' needs-handle' : ''}`}
      aria-labelledby={`${formId}-heading`}
    >
      <header className="creator-profile-editor-head">
        <div className="creator-profile-editor-head-row">
          <h2 id={`${formId}-heading`} className="creator-profile-editor-title">
            {t('creatorProfile.editorTitle')}
          </h2>
          {publishReady ? (
            <button type="button" className="creator-profile-done" onClick={() => setExpandedOverride(false)}>
              {t('creatorProfile.done')}
            </button>
          ) : null}
        </div>
        <p className="creator-profile-editor-copy">
          {needsHandle ? t('creatorProfile.editorNeeded') : t('creatorProfile.editorReady')}
        </p>
        {publishNudge && needsHandle ? (
          <p className="creator-profile-nudge" role="status">
            <PixelIcon name="sparkle" size={12} /> {t('creatorProfile.publishNudge')}
          </p>
        ) : null}
      </header>

      <div className="creator-profile-editor-body">
        <div className="creator-profile-editor-forms">
          {!me?.handle ? (
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
                    autoFocus={needsHandle}
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
              <div className="creator-profile-form-actions">
                <button type="submit" className="primary-btn" disabled={status === 'saving'}>
                  {t('creatorProfile.claimHandle')}
                </button>
              </div>
            </form>
          ) : (
            <>
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
                    rows={2}
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
                  <a className="creator-profile-text-link" href={creatorPath(me.handle)}>
                    {t('creatorProfile.viewPublic')}
                  </a>
                </div>
              </form>

              <details className="creator-profile-rename">
                <summary>{t('creatorProfile.renameHandle')}</summary>
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
                      <span className="creator-profile-avail is-taken">
                        {refusalCopy(availability.reason ?? 'taken')}
                      </span>
                    ) : null}
                    {availability?.available ? (
                      <span className="creator-profile-avail is-free">{t('creatorProfile.available')}</span>
                    ) : null}
                  </label>
                  <div className="creator-profile-form-actions">
                    <button type="submit" className="secondary-btn" disabled={status === 'saving'}>
                      {t('creatorProfile.renameHandle')}
                    </button>
                  </div>
                </form>
              </details>
            </>
          )}

          {message ? (
            <p className="creator-profile-message" role="status">
              {message}
            </p>
          ) : null}
        </div>

        <aside className="creator-profile-preview" aria-label={t('creatorProfile.previewAria')}>
          <p className="creator-profile-preview-kicker">{t('creatorProfile.previewKicker')}</p>
          <div className="creator-profile-preview-card">
            {showGoogleAvatar ? (
              <img className="creator-profile-preview-avatar" src={me!.picture!} alt="" width={40} height={40} />
            ) : (
              <span className="creator-profile-preview-letter" aria-hidden>
                {previewLetter}
              </span>
            )}
            <div className="creator-profile-preview-meta">
              <p className="creator-profile-preview-name">{previewName}</p>
              <p className="creator-profile-preview-handle">@{previewHandle}</p>
              <p className="creator-profile-preview-path">{previewPath}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
