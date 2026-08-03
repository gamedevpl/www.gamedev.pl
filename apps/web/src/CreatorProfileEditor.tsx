import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStudioCreatorProfile, type StudioCreatorProfile } from './studioCreatorProfile.js';
import type { AvatarMode, HandleClaimError, MeProfile } from './creatorProfileApi.js';
import { creatorPath } from './router.js';

type ProfileStatus = StudioCreatorProfile['status'];

/** Quiet Studio chrome: `@handle · Edit` once publish-ready; otherwise nothing. */
export function CreatorProfileEditor() {
  const { t } = useTranslation();
  const formId = useId();
  const {
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
    clearMessage,
  } = useStudioCreatorProfile();
  const [chromeExpanded, setChromeExpanded] = useState(false);

  if (status === 'loading' || status === 'error') return null;

  const publishReady = Boolean(me?.publishReady);
  if (!publishReady || !me?.handle) return null;

  if (!chromeExpanded) {
    return (
      <section className="creator-profile-editor is-collapsed is-chrome" aria-label={t('creatorProfile.editorTitle')}>
        <div className="creator-profile-chip-row">
          <button
            type="button"
            className="creator-profile-chip"
            onClick={() => setChromeExpanded(true)}
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
      </section>
    );
  }

  return (
    <ProfileEditPanel
      formId={formId}
      me={me}
      handleInput={handleInput}
      nameInput={nameInput}
      bioInput={bioInput}
      avatarMode={avatarMode}
      availability={availability}
      status={status}
      message={message}
      surfaceClass="is-chrome"
      title={t('creatorProfile.editorTitle')}
      copy={t('creatorProfile.editorReady')}
      onDone={() => {
        setChromeExpanded(false);
        clearMessage();
      }}
      onHandleChange={setHandleInput}
      onNameChange={setNameInput}
      onBioChange={setBioInput}
      onAvatarModeChange={setAvatarMode}
      onSaveDetails={async (event) => {
        await onSaveDetails(event);
        setChromeExpanded(false);
      }}
      onClaim={onClaim}
      refusalCopy={refusalCopy}
    />
  );
}

function ProfileEditPanel({
  formId,
  me,
  handleInput,
  nameInput,
  bioInput,
  avatarMode,
  availability,
  status,
  message,
  surfaceClass,
  title,
  copy,
  onDone,
  onHandleChange,
  onNameChange,
  onBioChange,
  onAvatarModeChange,
  onSaveDetails,
  onClaim,
  refusalCopy,
}: {
  formId: string;
  me: MeProfile;
  handleInput: string;
  nameInput: string;
  bioInput: string;
  avatarMode: AvatarMode;
  availability: { available: boolean; reason?: HandleClaimError } | null;
  status: ProfileStatus;
  message: string | null;
  surfaceClass: string;
  title: string;
  copy: string;
  onDone: () => void;
  onHandleChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onBioChange: (value: string) => void;
  onAvatarModeChange: (value: AvatarMode) => void;
  onSaveDetails: (event: FormEvent) => void | Promise<void>;
  onClaim: (event: FormEvent) => void | Promise<void>;
  refusalCopy: (code: HandleClaimError) => string;
}) {
  const { t } = useTranslation();
  const previewHandle = (handleInput.trim() || me.handle || 'you').toLowerCase();
  const previewName = (nameInput.trim() || me.profileName || previewHandle).trim();
  const previewLetter = previewName.charAt(0).toUpperCase() || '?';
  const showGoogleAvatar = avatarMode === 'google' && Boolean(me.picture);
  const previewPath = creatorPath(previewHandle);

  return (
    <section className={`creator-profile-editor is-expanded ${surfaceClass}`} aria-labelledby={`${formId}-heading`}>
      <header className="creator-profile-editor-head">
        <div className="creator-profile-editor-head-row">
          <h2 id={`${formId}-heading`} className="creator-profile-editor-title">
            {title}
          </h2>
          <button type="button" className="creator-profile-done" onClick={onDone}>
            {t('creatorProfile.done')}
          </button>
        </div>
        <p className="creator-profile-editor-copy">{copy}</p>
      </header>

      <div className="creator-profile-editor-body">
        <div className="creator-profile-editor-forms">
          <form className="creator-profile-form" onSubmit={(event) => void onSaveDetails(event)}>
            <label className="creator-profile-field">
              <span>{t('creatorProfile.nameLabel')}</span>
              <input
                className="creator-profile-input"
                value={nameInput}
                onChange={(event) => onNameChange(event.target.value)}
                maxLength={40}
                required
              />
            </label>
            <label className="creator-profile-field">
              <span>{t('creatorProfile.bioLabel')}</span>
              <textarea
                className="creator-profile-input creator-profile-bio-input"
                value={bioInput}
                onChange={(event) => onBioChange(event.target.value)}
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
                  onChange={() => onAvatarModeChange('google')}
                  disabled={!me.picture}
                />{' '}
                {t('creatorProfile.avatarGoogle')}
              </label>
              <label>
                <input
                  type="radio"
                  name="avatarMode"
                  checked={avatarMode === 'letter'}
                  onChange={() => onAvatarModeChange('letter')}
                />{' '}
                {t('creatorProfile.avatarLetter')}
              </label>
            </fieldset>
            <div className="creator-profile-form-actions">
              <button type="submit" className="primary-btn" disabled={status === 'saving'}>
                {t('creatorProfile.save')}
              </button>
              {me.handle ? (
                <a className="creator-profile-text-link" href={creatorPath(me.handle)}>
                  {t('creatorProfile.viewPublic')}
                </a>
              ) : null}
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
                    onChange={(event) => onHandleChange(event.target.value.toLowerCase())}
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
              <div className="creator-profile-form-actions">
                <button type="submit" className="secondary-btn" disabled={status === 'saving'}>
                  {t('creatorProfile.renameHandle')}
                </button>
              </div>
            </form>
          </details>

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
              <img className="creator-profile-preview-avatar" src={me.picture!} alt="" width={40} height={40} />
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
