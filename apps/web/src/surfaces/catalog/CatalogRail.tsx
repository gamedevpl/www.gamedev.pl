import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './catalog-rail.css';
import {
  catalogMediaUrl,
  defaultScreenshotIndex,
  gamePageHandle,
  isPlatformAuthor,
  type CatalogEntry,
} from '../../catalog.js';
import { isCatalogScrolling, whenCatalogScrollIdle } from './catalogScrollIdle.js';
import { PixelIcon } from '../../PixelIcon.js';
import { creatorPath, gamePath } from '../../core/router.js';
import { useInView } from '../../useInView.js';
import type { PlayVia } from '../../visitTelemetry.js';

// Curated home page surfaces above the full catalog grid.

// Same dwell delay as CatalogCard, to skip arming during scroll sweeps.
const RAIL_HOVER_INTENT_MS = 240;

function RailCard({
  entry,
  via,
  onPlayGame,
  onPlayTogether,
}: {
  entry: CatalogEntry;
  via: PlayVia;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  // Only the party rail passes this — other rails stay single-CTA.
  onPlayTogether?: (game: CatalogEntry, via?: PlayVia) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const cancelIdleWaitRef = useRef<(() => void) | null>(null);
  const [previewArmed, setPreviewArmed] = useState(false);
  // Unloads off-screen, same as the grid — rails hold a dozen cards.
  const { ref: mediaRef, inView } = useInView<HTMLDivElement>({ rootMargin: '200px 0px', once: false });
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[defaultScreenshotIndex(screenshots)];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file, 320) : undefined;
  const hasVideo = Boolean(entry.media?.video);
  const videoUrl =
    hasVideo && inView && previewArmed && entry.media?.video ? catalogMediaUrl(entry.slug, entry.media.video) : null;

  useEffect(() => {
    if (inView) return;
    clearHoverIntent();
    hoveringRef.current = false;
    setPreviewArmed(false);
  }, [inView]);

  useEffect(() => {
    if (!videoUrl) return;
    void Promise.resolve(videoRef.current?.play()).catch(() => {});
  }, [videoUrl]);

  useEffect(
    () => () => {
      clearHoverIntent();
      hoveringRef.current = false;
    },
    [],
  );

  function clearHoverIntent() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    cancelIdleWaitRef.current?.();
    cancelIdleWaitRef.current = null;
  }

  // Same idle wait as CatalogCard — a sliding rail must not arm this.
  function armFromHoverIntent() {
    if (!hoveringRef.current) return;
    if (isCatalogScrolling()) {
      cancelIdleWaitRef.current?.();
      cancelIdleWaitRef.current = whenCatalogScrollIdle(() => {
        cancelIdleWaitRef.current = null;
        armFromHoverIntent();
      });
      return;
    }
    setPreviewArmed(true);
  }

  function scheduleArm() {
    clearHoverIntent();
    hoveringRef.current = true;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      armFromHoverIntent();
    }, RAIL_HOVER_INTENT_MS);
  }

  function disarm() {
    hoveringRef.current = false;
    clearHoverIntent();
    setPreviewArmed(false);
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }

  // Touch-only tap target (CSS-gated) — hover never fires on a finger.
  function toggleTap() {
    if (previewArmed) {
      disarm();
      return;
    }
    clearHoverIntent();
    setPreviewArmed(true);
  }

  return (
    <article className="rail-card">
      <div
        ref={mediaRef}
        className="rail-card-media"
        tabIndex={hasVideo ? 0 : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse' && hasVideo) scheduleArm();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') disarm();
        }}
        onFocus={(event) => {
          if (event.target === event.currentTarget && hasVideo) setPreviewArmed(true);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) disarm();
        }}
      >
        <a
          className="rail-card-hit-area"
          href={`${gamePath(gamePageHandle(entry), entry.slug)}?via=${via}`}
          aria-label={`${entry.title} — ${t('catalog.openGame')}`}
        />
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <div className="rail-card-fallback" aria-hidden="true">
            <span>{entry.title.charAt(0)}</span>
          </div>
        )}
        <span className="rail-card-genre">{entry.genre}</span>
        {(entry.multiplayer || entry.editor === 'content') && (
          <div className="rail-card-capabilities">
            {entry.multiplayer && (
              <span className="rail-card-party-badge">
                <PixelIcon name="phone" size={11} /> {t('party.playersBadge', { max: entry.multiplayer.maxPlayers })}
              </span>
            )}
            {entry.editor === 'content' && (
              <span className="rail-card-party-badge" title={t('catalog.editorTooltip')}>
                <PixelIcon name="pencil" size={11} /> {t('catalog.editorBadge')}
              </span>
            )}
          </div>
        )}
        {hasVideo && (
          <button
            type="button"
            className="rail-card-preview-toggle"
            aria-pressed={previewArmed}
            aria-label={previewArmed ? t('catalog.pausePreview') : t('catalog.watchPreview')}
            onClick={toggleTap}
          >
            <PixelIcon name={previewArmed ? 'pause' : 'play'} size={12} />
          </button>
        )}
      </div>
      <div className="rail-card-body">
        <h4 className="rail-card-title">{entry.title}</h4>
        <div className="rail-card-actions">
          <button
            type="button"
            className={
              entry.multiplayer && onPlayTogether ? 'secondary-btn rail-card-play' : 'primary-btn rail-card-play'
            }
            onClick={() => onPlayGame(entry, via)}
          >
            <PixelIcon name="play" size={12} /> {t('catalog.play')}
          </button>
          {entry.multiplayer && onPlayTogether && (
            <button
              type="button"
              className="primary-btn rail-card-party"
              onClick={() => onPlayTogether(entry, via)}
              aria-label={t('party.playTogether')}
              title={t('party.playTogether')}
            >
              <PixelIcon name="phone" size={13} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

type CatalogRailProps = {
  heading: string;
  entries: CatalogEntry[];
  via: PlayVia;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  // Only the party rail passes this — other rails stay single-CTA.
  onPlayTogether?: (game: CatalogEntry, via?: PlayVia) => void;
  // Right-aligned count/link next to the heading.
  headingAside?: string;
  // Only shelves pass this — curated rails have nowhere to send it.
  onSeeAll?: () => void;
  // Scroll target for the header nav; only the party rail needs it.
  id?: string;
};

// Hides itself when empty — no empty-rail state to design.
export function CatalogRail({
  heading,
  entries,
  via,
  onPlayGame,
  onPlayTogether,
  headingAside,
  onSeeAll,
  id,
}: CatalogRailProps) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <section id={id} className="catalog-rail-section">
      <div className="catalog-rail-head">
        <h3 className="catalog-rail-heading">{heading}</h3>
        {headingAside ? <span className="catalog-rail-aside">{headingAside}</span> : null}
        {onSeeAll ? (
          <button type="button" className="catalog-rail-see-all" onClick={onSeeAll}>
            {t('catalog.seeAll')} &rarr;
          </button>
        ) : null}
      </div>
      <div className="catalog-rail-track">
        {entries.map((entry) => (
          <RailCard key={entry.slug} entry={entry} via={via} onPlayGame={onPlayGame} onPlayTogether={onPlayTogether} />
        ))}
      </div>
    </section>
  );
}

type FeaturedGameProps = {
  entry: CatalogEntry;
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
  // Same shelf as the featured pick, minus itself.
  moreLikeThis?: CatalogEntry[];
};

function MoreLikeThisThumb({ entry }: { entry: CatalogEntry }) {
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[defaultScreenshotIndex(screenshots)];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file, 160) : undefined;
  return (
    <a className="more-like-this-thumb" href={`${gamePath(gamePageHandle(entry), entry.slug)}?via=featured_similar`}>
      {posterUrl ? (
        <img src={posterUrl} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="more-like-this-thumb-fallback" aria-hidden="true">
          {entry.title.charAt(0)}
        </div>
      )}
      <span>{entry.title}</span>
    </a>
  );
}

// The curated, daily rotating hero pick above the rails.
export function FeaturedGame({ entry, onPlayGame, onPlayTogether, moreLikeThis = [] }: FeaturedGameProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[defaultScreenshotIndex(screenshots)];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file, 960) : undefined;
  const videoUrl = entry.media?.video ? catalogMediaUrl(entry.slug, entry.media.video) : null;

  // Tap-to-play, not autoplay — this is the page's heaviest asset.
  useEffect(() => setPreviewPlaying(false), [entry.slug]);

  // The video only mounts once playing flips true — wait for that first.
  useEffect(() => {
    if (!previewPlaying) return;
    void Promise.resolve(videoRef.current?.play()).catch(() => setPreviewPlaying(false));
  }, [previewPlaying]);

  function togglePreview() {
    if (!videoUrl) return;
    if (previewPlaying) {
      videoRef.current?.pause();
      setPreviewPlaying(false);
      return;
    }
    setPreviewPlaying(true);
  }

  return (
    <article className="featured-game">
      <div className="featured-game-media">
        <a
          className="featured-game-hit-area"
          href={`${gamePath(gamePageHandle(entry), entry.slug)}?via=featured`}
          aria-label={`${entry.title} — ${t('catalog.openGame')}`}
        />
        {previewPlaying && videoUrl ? (
          <video
            ref={videoRef}
            className="featured-game-preview"
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="auto"
            aria-label={t('catalog.previewVideo', { title: entry.title })}
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt="" loading="eager" decoding="async" />
        ) : null}
        {videoUrl && (
          <button
            type="button"
            className={`featured-game-preview-toggle${previewPlaying ? ' is-playing' : ''}`}
            aria-pressed={previewPlaying}
            aria-label={previewPlaying ? t('catalog.pausePreview') : t('catalog.watchPreview')}
            onClick={togglePreview}
          >
            <PixelIcon name={previewPlaying ? 'pause' : 'play'} size={previewPlaying ? 14 : 22} />
          </button>
        )}
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
        {moreLikeThis.length > 0 ? (
          <div className="more-like-this">
            <div className="more-like-this-label">{t('catalog.moreLikeThis')}</div>
            <div className="more-like-this-thumbs">
              {moreLikeThis.map((similar) => (
                <MoreLikeThisThumb key={similar.slug} entry={similar} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
