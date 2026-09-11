import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

// Grid card for the catalog: poster, hover preview, badges, play CTAs.

function humanizeMoment(name: string): string {
  return name
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

// Hover must dwell this long before moments load or video arms.
const HOVER_INTENT_MS = 240;

export function CatalogCard({
  entry,
  isYours = false,
  onPlayGame,
  onPlayTogether,
}: {
  entry: CatalogEntry;
  isYours?: boolean;
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoveringRef = useRef(false);
  const cancelIdleWaitRef = useRef<(() => void) | null>(null);
  // Video and moments arm only on deliberate engage; leaving view unloads.
  const { ref: mediaRef, inView } = useInView<HTMLDivElement>({ rootMargin: '80px 0px', once: false });
  const screenshots = entry.media?.screenshots ?? [];
  const [selectedScreenshot, setSelectedScreenshot] = useState(() => defaultScreenshotIndex(screenshots));
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);
  const [videoArmed, setVideoArmed] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const selected = screenshots[selectedScreenshot] ?? screenshots[0];
  // 640px poster: roughly 2x the drawn card box, cheap to decode.
  const posterUrl = selected && inView ? catalogMediaUrl(entry.slug, selected.file, 640) : undefined;
  const hasVideo = Boolean(entry.media?.video);
  const hasMoments = screenshots.length > 1;
  const videoUrl =
    hasVideo && inView && videoArmed && entry.media?.video ? catalogMediaUrl(entry.slug, entry.media.video) : null;
  const showMoments = extrasOpen && inView && hasMoments;

  useEffect(() => {
    if (inView) return;
    hoveringRef.current = false;
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    cancelIdleWaitRef.current?.();
    cancelIdleWaitRef.current = null;
    setExtrasOpen(false);
    setVideoArmed(false);
    setIsPreviewPlaying(false);
    setIsPreviewPinned(false);
  }, [inView]);

  useEffect(() => {
    if (!videoUrl) return;
    const video = videoRef.current;
    if (!video) return;
    try {
      void Promise.resolve(video.play()).then(
        () => setIsPreviewPlaying(true),
        () => setIsPreviewPlaying(false),
      );
    } catch {
      setIsPreviewPlaying(false);
    }
  }, [videoUrl]);

  useEffect(
    () => () => {
      hoveringRef.current = false;
      if (hoverTimerRef.current != null) window.clearTimeout(hoverTimerRef.current);
      cancelIdleWaitRef.current?.();
      cancelIdleWaitRef.current = null;
    },
    [],
  );

  function armPreview() {
    setVideoArmed(true);
    const video = videoRef.current;
    if (!video?.src) return;
    try {
      void Promise.resolve(video.play()).then(
        () => setIsPreviewPlaying(true),
        () => setIsPreviewPlaying(false),
      );
    } catch {
      setIsPreviewPlaying(false);
    }
  }

  function stopPreview() {
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    setVideoArmed(false);
    setIsPreviewPlaying(false);
  }

  function pausePreview() {
    const video = videoRef.current;
    if (video) video.pause();
    setIsPreviewPlaying(false);
  }

  function clearHoverIntent() {
    if (hoverTimerRef.current != null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    cancelIdleWaitRef.current?.();
    cancelIdleWaitRef.current = null;
  }

  // Open moments and arm video once the pointer is idle.
  function armExtrasFromHover() {
    if (!hoveringRef.current) return;
    if (isCatalogScrolling()) {
      // Inertial scroll parks the cursor; wait for idle, keep the intent.
      cancelIdleWaitRef.current?.();
      cancelIdleWaitRef.current = whenCatalogScrollIdle(() => {
        cancelIdleWaitRef.current = null;
        armExtrasFromHover();
      });
      return;
    }
    setExtrasOpen(true);
    if (hasVideo) armPreview();
  }

  function scheduleHoverIntent() {
    clearHoverIntent();
    hoveringRef.current = true;
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      armExtrasFromHover();
    }, HOVER_INTENT_MS);
  }

  function endHoverIntent() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (isPreviewPinned) return;
    setExtrasOpen(false);
    stopPreview();
  }

  function togglePreview() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (isPreviewPlaying) {
      setIsPreviewPinned(false);
      pausePreview();
    } else {
      setExtrasOpen(true);
      setIsPreviewPinned(true);
      armPreview();
    }
  }

  // Video-less cards pin or unpin the moment strip explicitly.
  function toggleMoments() {
    hoveringRef.current = false;
    clearHoverIntent();
    if (extrasOpen) {
      setIsPreviewPinned(false);
      setExtrasOpen(false);
    } else {
      setExtrasOpen(true);
      setIsPreviewPinned(true);
    }
  }

  function selectScreenshot(index: number) {
    setSelectedScreenshot(index);
    setIsPreviewPinned(false);
    stopPreview();
  }

  return (
    <article className="catalog-card">
      <div
        ref={mediaRef}
        className="catalog-media"
        tabIndex={hasVideo || hasMoments ? 0 : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') scheduleHoverIntent();
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') endHoverIntent();
        }}
        onFocus={(event) => {
          if (event.target !== event.currentTarget) return;
          setExtrasOpen(true);
          if (hasVideo) armPreview();
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          hoveringRef.current = false;
          clearHoverIntent();
          setIsPreviewPinned(false);
          setExtrasOpen(false);
          stopPreview();
        }}
      >
        <a
          className="catalog-card-hit-area"
          href={gamePath(gamePageHandle(entry), entry.slug)}
          aria-label={`${entry.title} — ${t('catalog.openGame')}`}
        />
        {videoUrl ? (
          <video
            ref={videoRef}
            className="catalog-preview"
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="auto"
            aria-label={t('catalog.previewVideo', { title: entry.title })}
            onPlay={() => setIsPreviewPlaying(true)}
            onPause={() => setIsPreviewPlaying(false)}
          />
        ) : posterUrl ? (
          <img
            className="catalog-preview"
            src={posterUrl}
            alt={t('catalog.previewImage', { title: entry.title })}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="catalog-preview-fallback" aria-hidden="true">
            <span>{entry.title.charAt(0)}</span>
            <small>{entry.genre}</small>
          </div>
        )}

        {
          // Both badges anchor one corner, so they stack instead of overlapping.
        }
        <div className="catalog-badges-top-left">
          {
            // Label sits in its own span; a finger gets the icon alone.
            hasVideo && (
              <button
                type="button"
                className="preview-toggle preview-toggle--video"
                aria-pressed={isPreviewPlaying}
                aria-label={isPreviewPlaying ? t('catalog.pausePreview') : t('catalog.watchPreview')}
                disabled={!inView}
                onClick={togglePreview}
              >
                <PixelIcon name={isPreviewPlaying ? 'pause' : 'play'} size={11} />
                <span className="btn-label">
                  {isPreviewPlaying ? t('catalog.pausePreview') : t('catalog.watchPreview')}
                </span>
              </button>
            )
          }

          {
            // Trailer-less cards still need a deliberate way to open moments.
            !hasVideo && hasMoments && (
              <button
                type="button"
                className="preview-toggle"
                aria-pressed={extrasOpen}
                aria-label={extrasOpen ? t('catalog.hideMoments') : t('catalog.showMoments')}
                disabled={!inView}
                onClick={toggleMoments}
              >
                <PixelIcon name="image" size={11} />
                <span className="btn-label">{extrasOpen ? t('catalog.hideMoments') : t('catalog.showMoments')}</span>
              </button>
            )
          }

          {
            // Only 'none' earns a badge: a finger cannot drive the game.
            entry.touch === 'none' && (
              <span className="touch-warning-pill" title={t('catalog.keyboardOnlyTooltip')}>
                <PixelIcon name="gamepad" size={10} /> {t('catalog.keyboardOnly')}
              </span>
            )
          }

          {isYours ? (
            <span className="yours-pill" title={t('catalog.yoursBadge')}>
              <PixelIcon name="user" size={10} /> {t('catalog.yoursBadge')}
            </span>
          ) : null}
        </div>

        <span className="genre-pill">{entry.genre}</span>

        {showMoments && (
          <div className="catalog-moments" aria-label={t('catalog.gameMoments', { title: entry.title })}>
            {screenshots.slice(0, 4).map((screenshot, index) => (
              <button
                key={screenshot.file}
                type="button"
                className={index === selectedScreenshot ? 'catalog-moment is-selected' : 'catalog-moment'}
                aria-label={t('catalog.viewMoment', { moment: humanizeMoment(screenshot.name), title: entry.title })}
                aria-pressed={index === selectedScreenshot}
                onClick={() => selectScreenshot(index)}
              >
                <img src={catalogMediaUrl(entry.slug, screenshot.file, 96)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        {
          // Title, hint and CTA sit over the preview, saving a content row.
        }
        <div className="catalog-overlay">
          <div className="card-copy">
            <h3 className="card-title">
              {entry.title}
              {entry.multiplayer && (
                <span className="card-party-badge">
                  <PixelIcon name="phone" size={12} /> {t('party.playersBadge', { max: entry.multiplayer.maxPlayers })}
                </span>
              )}
              {
                // Says what the game does, not what this signed-out visitor gets.
                entry.saves === 'player' && (
                  <span className="card-saves-badge">
                    <PixelIcon name="clock" size={12} /> {t('catalog.savesBadge')}
                  </span>
                )
              }
              {
                // The one badge about other people rather than about the game.
                entry.world === 'shared' && (
                  <span className="card-world-badge">
                    <PixelIcon name="star" size={12} /> {t('catalog.worldBadge')}
                  </span>
                )
              }
              {
                // Advisory: the game answers tilt where the device offers it.
                entry.sensing === 'tilt' && (
                  <span className="card-party-badge" title={t('catalog.tiltTooltip')}>
                    <PixelIcon name="phone" size={12} /> {t('catalog.tiltBadge')}
                  </span>
                )
              }
              {entry.sensing === 'backdrop' && (
                <span className="card-party-badge" title={t('catalog.cameraTooltip')}>
                  <PixelIcon name="phone" size={12} /> {t('catalog.cameraBadge')}
                </span>
              )}
            </h3>
            <p className="card-author">
              {entry.creatorHandle && !isPlatformAuthor(entry.submittedBy) ? (
                <>
                  {t('player.byAuthorPrefix')}
                  <a className="card-author-link" href={creatorPath(entry.creatorHandle)}>
                    {entry.submittedBy}
                  </a>
                </>
              ) : (
                t('player.byAuthor', {
                  author: isPlatformAuthor(entry.submittedBy) ? t('catalog.platformAuthor') : entry.submittedBy,
                })
              )}
            </p>
            {
              // Contributor credit on its own line, so authorship stays unblurred.
              entry.contributorHandles && entry.contributorHandles.length > 0 ? (
                <p className="card-contributors">
                  {t('catalog.withContributions')}{' '}
                  {entry.contributorHandles.map((handle, index) => (
                    <span key={handle}>
                      {index > 0 ? ', ' : null}
                      <a className="card-author-link" href={creatorPath(handle)}>
                        @{handle}
                      </a>
                    </span>
                  ))}
                </p>
              ) : null
            }
          </div>
          <div className="card-actions">
            <button type="button" className="primary-btn" onClick={() => onPlayGame(entry)}>
              <PixelIcon name="play" size={13} /> {t('catalog.play')}
            </button>
            {entry.multiplayer && (
              <button type="button" className="secondary-btn party-btn" onClick={() => onPlayTogether(entry)}>
                <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
