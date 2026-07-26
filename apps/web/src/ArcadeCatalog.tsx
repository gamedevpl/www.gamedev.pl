import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogMediaUrl, type CatalogEntry } from './catalog';
import { PixelIcon } from './PixelIcon';
import { useInView } from './useInView';

type ArcadeCatalogProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
  onRetryCatalog: () => void;
};

function humanizeMoment(name: string): string {
  return name
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');
}

function CatalogCard({
  entry,
  onPlayGame,
  onPlayTogether,
}: {
  entry: CatalogEntry;
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Defer preview media until the card is near the viewport — below-fold cards
  // must not fetch posters/videos on initial home load.
  const { ref: mediaRef, inView } = useInView<HTMLDivElement>({ rootMargin: '200px 0px', once: true });
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[selectedScreenshot] ?? screenshots[0];
  const posterUrl = selected && inView ? catalogMediaUrl(entry.slug, selected.file) : undefined;
  const videoUrl = entry.media?.video && inView ? catalogMediaUrl(entry.slug, entry.media.video) : null;
  const hasVideo = Boolean(entry.media?.video);

  function playPreview() {
    const video = videoRef.current;
    if (!video) return;
    void video.play().then(
      () => setIsPreviewPlaying(true),
      () => setIsPreviewPlaying(false),
    );
  }

  function pausePreview(reset = false) {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (reset) {
      video.currentTime = 0;
    }
    setIsPreviewPlaying(false);
  }

  function togglePreview() {
    if (isPreviewPlaying) {
      setIsPreviewPinned(false);
      pausePreview();
    } else {
      setIsPreviewPinned(true);
      playPreview();
    }
  }

  function selectScreenshot(index: number) {
    setSelectedScreenshot(index);
    setIsPreviewPinned(false);
    pausePreview(true);
  }

  return (
    <article className="catalog-card">
      <div
        ref={mediaRef}
        className="catalog-media"
        tabIndex={hasVideo ? 0 : undefined}
        onPointerEnter={
          hasVideo
            ? (event) => {
                if (event.pointerType === 'mouse') playPreview();
              }
            : undefined
        }
        onPointerLeave={
          hasVideo
            ? (event) => {
                if (event.pointerType === 'mouse' && !isPreviewPinned) pausePreview(true);
              }
            : undefined
        }
        onFocus={
          hasVideo
            ? (event) => {
                if (event.target === event.currentTarget) playPreview();
              }
            : undefined
        }
        onBlur={
          hasVideo
            ? (event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsPreviewPinned(false);
                  pausePreview(true);
                }
              }
            : undefined
        }
      >
        {videoUrl ? (
          <video
            key={posterUrl}
            ref={videoRef}
            className="catalog-preview"
            src={videoUrl}
            poster={posterUrl}
            muted
            loop
            playsInline
            preload="metadata"
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

        {/* Both badges anchor the same corner, so they stack in a column instead of
            each claiming top:10px/left:10px independently — the previous version had
            the AI disclosure drawn directly on top of the preview toggle on every
            card with a video. Flex + gap rather than a fixed pixel offset because the
            toggle's Polish label ("Wstrzymaj podgląd") runs longer than the English
            one and can wrap; a magic number here would work in one locale and not
            the other. */}
        <div className="catalog-badges-top-left">
          {hasVideo && (
            <button
              type="button"
              className="preview-toggle"
              aria-pressed={isPreviewPlaying}
              disabled={!inView}
              onClick={togglePreview}
            >
              {isPreviewPlaying ? (
                <>
                  <PixelIcon name="pause" size={11} /> {t('catalog.pausePreview')}
                </>
              ) : (
                <>
                  <PixelIcon name="play" size={11} /> {t('catalog.watchPreview')}
                </>
              )}
            </button>
          )}

          {/* AI Act art. 50: content generated by an AI system has to be disclosed as
              such to the people who encounter it. The catalog card is where someone
              first meets a game, so the disclosure belongs here and not only in the
              terms — a label nobody sees before choosing is not a disclosure. */}
          <span className="ai-pill" title={t('ai.generatedTooltip')}>
            <PixelIcon name="sparkle" size={10} /> {t('ai.generatedShort')}
          </span>
        </div>

        <span className="genre-pill">{entry.genre}</span>

        {inView && screenshots.length > 1 && (
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
                <img src={catalogMediaUrl(entry.slug, screenshot.file)} alt="" loading="lazy" decoding="async" />
              </button>
            ))}
          </div>
        )}

        {/* Title, one-line control hint and the Play CTA sit on top of the preview over
            a bottom scrim, so the card is just the media box — no separate content
            row underneath. Saves ~90px of height per card without dropping any info. */}
        <div className="catalog-overlay">
          <h3 className="card-title">
            {entry.title}
            {entry.multiplayer && (
              <span className="card-party-badge">
                <PixelIcon name="phone" size={12} /> {t('party.playersBadge', { max: entry.multiplayer.maxPlayers })}
              </span>
            )}
          </h3>
          <div className="card-actions">
            <button className="primary-btn" onClick={() => onPlayGame(entry)}>
              <PixelIcon name="play" size={13} /> {t('catalog.play')}
            </button>
            {entry.multiplayer && (
              <button className="secondary-btn party-btn" onClick={() => onPlayTogether(entry)}>
                <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function ArcadeCatalog({
  catalogStatus,
  catalogError,
  catalogEntries,
  onPlayGame,
  onPlayTogether,
  onRetryCatalog,
}: ArcadeCatalogProps) {
  const { t } = useTranslation();

  return (
    <section id="arcade" className="arcade-section">
      <div className="arcade-header">
        <h2 className="arcade-title">{t('catalog.title')}</h2>
      </div>

      {catalogStatus === 'loading' ? (
        <p className="catalog-state">{t('catalog.loading')}</p>
      ) : catalogStatus === 'error' ? (
        <div className="load-error" role="alert">
          <p className="error">{t('catalog.error', { message: catalogError ?? t('errors.generic') })}</p>
          <button type="button" className="secondary-btn" onClick={onRetryCatalog}>
            <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
          </button>
        </div>
      ) : catalogEntries.length === 0 ? (
        <p className="catalog-state">{t('catalog.empty')}</p>
      ) : (
        <div className="catalog-grid">
          {catalogEntries.map((entry) => (
            <CatalogCard key={entry.slug} entry={entry} onPlayGame={onPlayGame} onPlayTogether={onPlayTogether} />
          ))}
        </div>
      )}
    </section>
  );
}
