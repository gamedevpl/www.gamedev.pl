import { useTranslation } from 'react-i18next';
import {
  catalogMediaUrl,
  defaultScreenshotIndex,
  gamePageHandle,
  isPlatformAuthor,
  type CatalogEntry,
} from './catalog.js';
import { PixelIcon } from './PixelIcon.js';
import { creatorPath, gamePath } from './router.js';
import type { PlayVia } from './visitTelemetry.js';

// Curated home page surfaces above the full catalog grid.

function RailCard({
  entry,
  via,
  onPlayGame,
}: {
  entry: CatalogEntry;
  via: PlayVia;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
}) {
  const { t } = useTranslation();
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[defaultScreenshotIndex(screenshots)];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file, 320) : undefined;

  return (
    <article className="rail-card">
      <div className="rail-card-media">
        <a
          className="rail-card-hit-area"
          href={gamePath(gamePageHandle(entry), entry.slug)}
          aria-label={`${entry.title} — ${t('catalog.openGame')}`}
        />
        {posterUrl ? (
          <img src={posterUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="rail-card-fallback" aria-hidden="true">
            <span>{entry.title.charAt(0)}</span>
          </div>
        )}
        <span className="rail-card-genre">{entry.genre}</span>
        {entry.multiplayer && (
          <span className="rail-card-party-badge">
            <PixelIcon name="phone" size={11} /> {t('party.playersBadge', { max: entry.multiplayer.maxPlayers })}
          </span>
        )}
      </div>
      <div className="rail-card-body">
        <h4 className="rail-card-title">{entry.title}</h4>
        <button type="button" className="primary-btn rail-card-play" onClick={() => onPlayGame(entry, via)}>
          <PixelIcon name="play" size={12} /> {t('catalog.play')}
        </button>
      </div>
    </article>
  );
}

type CatalogRailProps = {
  heading: string;
  entries: CatalogEntry[];
  via: PlayVia;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  // Right-aligned count/link next to the heading.
  headingAside?: string;
};

// Hides itself when empty — no empty-rail state to design.
export function CatalogRail({ heading, entries, via, onPlayGame, headingAside }: CatalogRailProps) {
  if (entries.length === 0) return null;
  return (
    <section className="catalog-rail-section">
      <div className="catalog-rail-head">
        <h3 className="catalog-rail-heading">{heading}</h3>
        {headingAside ? <span className="catalog-rail-aside">{headingAside}</span> : null}
      </div>
      <div className="catalog-rail-track">
        {entries.map((entry) => (
          <RailCard key={entry.slug} entry={entry} via={via} onPlayGame={onPlayGame} />
        ))}
      </div>
    </section>
  );
}

type FeaturedGameProps = {
  entry: CatalogEntry;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
};

// The curated, daily rotating hero pick above the rails.
export function FeaturedGame({ entry, onPlayGame, onPlayTogether }: FeaturedGameProps) {
  const { t } = useTranslation();
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[defaultScreenshotIndex(screenshots)];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file, 960) : undefined;

  return (
    <article className="featured-game">
      <div className="featured-game-media">
        {posterUrl ? <img src={posterUrl} alt="" loading="eager" decoding="async" /> : null}
      </div>
      <div className="featured-game-body">
        <span className="featured-game-kicker">
          <PixelIcon name="sparkle" size={12} /> {t('catalog.featuredKicker')}
        </span>
        <h3 className="featured-game-title">{entry.title}</h3>
        <p className="featured-game-meta">{t('catalog.controlsSummary', { controls: entry.controls })}</p>
        <p className="featured-game-author">
          {entry.creatorHandle && !isPlatformAuthor(entry.submittedBy) ? (
            <>
              {t('player.byAuthorPrefix')}{' '}
              <a className="featured-game-author-link" href={creatorPath(entry.creatorHandle)}>
                {entry.submittedBy}
              </a>
            </>
          ) : (
            t('player.byAuthor', {
              author: isPlatformAuthor(entry.submittedBy) ? t('catalog.platformAuthor') : entry.submittedBy,
            })
          )}
        </p>
        <div className="featured-game-actions">
          <button type="button" className="primary-btn inline-btn" onClick={() => onPlayGame(entry, 'featured')}>
            <PixelIcon name="play" size={13} /> {t('catalog.play')}
          </button>
          {entry.multiplayer && (
            <button
              type="button"
              className="secondary-btn inline-btn party-btn"
              onClick={() => onPlayTogether(entry, 'featured')}
            >
              <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
