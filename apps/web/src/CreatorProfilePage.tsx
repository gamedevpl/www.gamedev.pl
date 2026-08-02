import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogMediaUrl, isPlatformAuthor, normalizeCatalogEntry, type CatalogEntry } from './catalog.js';
import { fetchCreatorPage, type PublicCreatorProfile } from './creatorProfileApi.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath, playPath } from './router.js';

/**
 * Public creator profile — identity header + published games grid.
 * Reachable without a session (same posture as contact/legal).
 */
export function CreatorProfilePage({
  handle,
  onBack,
  onPlay,
  onProfileLoaded,
}: {
  handle: string;
  onBack: () => void;
  onPlay: (slug: string) => void;
  /** Lets App set document.title once the display name is known. */
  onProfileLoaded?: (profile: PublicCreatorProfile) => void;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<PublicCreatorProfile | null>(null);
  const [games, setGames] = useState<CatalogEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setProfile(null);
    setGames([]);
    void fetchCreatorPage(handle)
      .then((page) => {
        if (cancelled) return;
        setProfile(page.profile);
        setGames(
          page.games
            .map((game) => normalizeCatalogEntry(game))
            .filter((entry): entry is CatalogEntry => entry !== null),
        );
        setState('ready');
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setState(err.code === 'not_found' ? 'missing' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  useEffect(() => {
    if (profile) onProfileLoaded?.(profile);
  }, [profile, onProfileLoaded]);

  const letter = (profile?.profileName || handle).charAt(0).toUpperCase();

  return (
    <article className="creator-profile-page">
      <header className="creator-profile-header">
        <button type="button" className="secondary-btn contact-back" onClick={onBack}>
          <PixelIcon name="close" size={12} /> {t('creatorProfile.back')}
        </button>

        {state === 'loading' ? <p className="creator-profile-status">{t('creatorProfile.loading')}</p> : null}
        {state === 'missing' ? <p className="creator-profile-status">{t('creatorProfile.missing')}</p> : null}
        {state === 'error' ? (
          <p className="creator-profile-status creator-profile-error">{t('creatorProfile.error')}</p>
        ) : null}

        {state === 'ready' && profile ? (
          <div className="creator-profile-identity">
            {profile.avatarUrl ? (
              <img className="creator-profile-avatar" src={profile.avatarUrl} alt="" width={72} height={72} />
            ) : (
              <span className="creator-profile-lettermark" aria-hidden="true">
                {letter}
              </span>
            )}
            <div>
              <h1 className="creator-profile-name">{profile.profileName}</h1>
              <p className="creator-profile-handle">@{profile.handle}</p>
              {profile.bio ? <p className="creator-profile-bio">{profile.bio}</p> : null}
              <p className="creator-profile-share">
                <a href={creatorPath(profile.handle)}>{t('creatorProfile.shareHint')}</a>
              </p>
            </div>
          </div>
        ) : null}
      </header>

      {state === 'ready' ? (
        <section className="creator-profile-games" aria-label={t('creatorProfile.gamesAria')}>
          <h2 className="creator-profile-games-heading">{t('creatorProfile.gamesHeading', { count: games.length })}</h2>
          {games.length === 0 ? (
            <p className="creator-profile-status">{t('creatorProfile.noGames')}</p>
          ) : (
            <ul className="creator-profile-game-list">
              {games.map((game) => {
                const poster = game.media?.screenshots[0]?.file;
                const author = isPlatformAuthor(game.submittedBy)
                  ? t('catalog.platformAuthor')
                  : (game.submittedBy ?? profile?.profileName);
                return (
                  <li key={game.slug} className="creator-profile-game">
                    {poster ? (
                      <img
                        className="creator-profile-game-thumb"
                        src={catalogMediaUrl(game.slug, poster)}
                        alt=""
                        width={160}
                        height={90}
                      />
                    ) : (
                      <span className="creator-profile-game-thumb creator-profile-game-thumb--empty" aria-hidden />
                    )}
                    <div className="creator-profile-game-meta">
                      <h3 className="creator-profile-game-title">{game.title}</h3>
                      <p className="creator-profile-game-by">{t('player.byAuthor', { author })}</p>
                      <button type="button" className="primary-btn" onClick={() => onPlay(game.slug)}>
                        <PixelIcon name="play" size={13} /> {t('catalog.play')}
                      </button>
                      <a className="creator-profile-game-link" href={playPath(game.slug)}>
                        {t('creatorProfile.openPermalink')}
                      </a>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
    </article>
  );
}
