import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { catalogMediaUrl, type CatalogEntry } from './catalog';

type ArcadeCatalogProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry) => void;
  onRemixGame: (game: CatalogEntry) => void;
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
  onRemixGame,
}: {
  entry: CatalogEntry;
  onPlayGame: (game: CatalogEntry) => void;
  onRemixGame: (game: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedScreenshot, setSelectedScreenshot] = useState(0);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewPinned, setIsPreviewPinned] = useState(false);
  const screenshots = entry.media?.screenshots ?? [];
  const selected = screenshots[selectedScreenshot] ?? screenshots[0];
  const posterUrl = selected ? catalogMediaUrl(entry.slug, selected.file) : undefined;
  const videoUrl = entry.media?.video ? catalogMediaUrl(entry.slug, entry.media.video) : null;

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
        className="catalog-media"
        tabIndex={videoUrl ? 0 : undefined}
        onPointerEnter={
          videoUrl
            ? (event) => {
                if (event.pointerType === 'mouse') playPreview();
              }
            : undefined
        }
        onPointerLeave={
          videoUrl
            ? (event) => {
                if (event.pointerType === 'mouse' && !isPreviewPinned) pausePreview(true);
              }
            : undefined
        }
        onFocus={
          videoUrl
            ? (event) => {
                if (event.target === event.currentTarget) playPreview();
              }
            : undefined
        }
        onBlur={
          videoUrl
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
          <img className="catalog-preview" src={posterUrl} alt={t('catalog.previewImage', { title: entry.title })} />
        ) : (
          <div className="catalog-preview-fallback" aria-hidden="true">
            <span>{entry.title.charAt(0)}</span>
            <small>{entry.genre}</small>
          </div>
        )}

        {videoUrl && (
          <button type="button" className="preview-toggle" aria-pressed={isPreviewPlaying} onClick={togglePreview}>
            {isPreviewPlaying ? `❚❚ ${t('catalog.pausePreview')}` : `▶ ${t('catalog.watchPreview')}`}
          </button>
        )}
      </div>

      {screenshots.length > 1 && (
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
              <img src={catalogMediaUrl(entry.slug, screenshot.file)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      <div className="catalog-card-content">
        <div className="card-header">
          <h3>{entry.title}</h3>
          <span className="genre-pill">{entry.genre}</span>
        </div>

        <dl className="catalog-meta">
          <div>
            <dt>{t('catalog.controls')}</dt>
            <dd>{entry.controls}</dd>
          </div>
        </dl>

        <div className="card-actions">
          <button className="primary-btn" onClick={() => onPlayGame(entry)}>
            ▶ {t('catalog.play')}
          </button>
          <button className="secondary-btn" onClick={() => onRemixGame(entry)}>
            ⚡ {t('catalog.remix')}
          </button>
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
  onRemixGame,
}: ArcadeCatalogProps) {
  const { t } = useTranslation();

  return (
    <section id="arcade" className="arcade-section">
      <div className="arcade-header">
        <h2 className="arcade-title">{t('catalog.title')}</h2>
        <p className="arcade-subtitle">{t('catalog.subtitle')}</p>
      </div>

      {catalogStatus === 'loading' ? (
        <p className="catalog-state">{t('catalog.loading')}</p>
      ) : catalogStatus === 'error' ? (
        <p className="error">{t('catalog.error', { message: catalogError ?? t('errors.generic') })}</p>
      ) : catalogEntries.length === 0 ? (
        <p className="catalog-state">{t('catalog.empty')}</p>
      ) : (
        <div className="catalog-grid">
          {catalogEntries.map((entry) => (
            <CatalogCard key={entry.slug} entry={entry} onPlayGame={onPlayGame} onRemixGame={onRemixGame} />
          ))}
        </div>
      )}
    </section>
  );
}
