import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { useAuth } from './AuthContext.js';
import { catalogMediaUrl, isPlatformAuthor, type CatalogEntry } from './catalog.js';
import { PixelIcon } from './PixelIcon.js';
import { ShareGameButton } from './ShareGameButton.js';
import { VoteWidget } from './VoteWidget.js';
import { creatorPath, studioPath } from './core/router.js';
import { recordRemixStep } from './visitTelemetry.js';

type GameDetailPageProps = {
  game: CatalogEntry | null;
  state: 'loading' | 'ready' | 'error';
  onPlay: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
  onRemix: (game: CatalogEntry) => void;
  onRetry: () => void;
};

/** Prefer a gameplay moment over an opening/title capture. */
function previewScreenshot(game: CatalogEntry) {
  const screenshots = game.media?.screenshots ?? [];
  return screenshots.find((shot) => shot.name !== 'opening') ?? screenshots[0] ?? null;
}

/**
 * Loading/error shell under `/play/<slug>` before theater auto-opens.
 *
 * Published play redirects Close onto the canonical game page ({@link GamePage}).
 * This surface never mounts the iframe.
 */
export function GameDetailPage({ game, state, onPlay, onPlayTogether, onRemix, onRetry }: GameDetailPageProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [selectedScreenshotName, setSelectedScreenshotName] = useState<string | null>(null);

  useEffect(() => {
    if (!game) return;
    recordRemixStep(game.editor === 'content' ? 'offered' : 'no_lane', { control: 'page' });
  }, [game]);

  if (state === 'loading') {
    // Fallback mascot if mounted while catalog still loads.
    return <AppLoadingScreen />;
  }

  if (state === 'error') {
    return (
      <section className="game-page-state" role="alert">
        <p>{t('gamePage.loadError')}</p>
        <button type="button" className="secondary-btn" onClick={onRetry}>
          <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
        </button>
      </section>
    );
  }

  if (!game) {
    return <p className="game-page-state">{t('gamePage.missing')}</p>;
  }

  const screenshots = game.media?.screenshots ?? [];
  const primaryScreenshot = previewScreenshot(game);
  const screenshot = screenshots.find((candidate) => candidate.name === selectedScreenshotName) ?? primaryScreenshot;
  const authorLabel = isPlatformAuthor(game.submittedBy) ? t('catalog.platformAuthor') : game.submittedBy;
  const authorPath = game.creatorHandle ? creatorPath(game.creatorHandle) : null;
  const isOwner = Boolean(
    user?.handle && game.creatorHandle && user.handle.toLowerCase() === game.creatorHandle.toLowerCase(),
  );

  const play = () => onPlay(game);
  const playTogether = () => onPlayTogether(game);
  const remix = () => {
    recordRemixStep('opened', { control: 'page' });
    onRemix(game);
  };

  return (
    <article className="game-page">
      <header className="game-page-header">
        <div className="game-page-kicker">
          {authorPath ? <a href={authorPath}>{authorLabel}</a> : <span>{authorLabel}</span>}
          {game.genre ? <span className="game-page-genre">{game.genre}</span> : null}
          {game.editor === 'content' ? (
            <span className="game-page-genre game-page-editor-badge">
              <PixelIcon name="pencil" size={11} /> {t('catalog.editorBadge')}
            </span>
          ) : null}
        </div>
        <h1>{game.title}</h1>

        <div className="game-page-actions" aria-label={t('gamePage.actions')}>
          <button type="button" className="primary-btn" onClick={play}>
            <PixelIcon name="play" size={13} /> {t('catalog.play')}
          </button>
          {game.multiplayer ? (
            <button type="button" className="secondary-btn party-btn" onClick={playTogether}>
              <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
            </button>
          ) : null}
          <VoteWidget slug={game.slug} />
          {isOwner ? (
            <a className="secondary-btn game-page-studio" href={studioPath(game.slug)}>
              <PixelIcon name="wrench" size={13} /> {t('gamePage.openStudio')}
            </a>
          ) : null}
          {game.editor === 'content' ? (
            <button type="button" className="secondary-btn game-page-remix" onClick={remix}>
              <PixelIcon name="wrench" size={13} /> {t('catalog.remix')}
            </button>
          ) : null}
          <ShareGameButton slug={game.slug} title={game.title} />
        </div>
      </header>

      <button
        type="button"
        className="game-page-preview"
        onClick={play}
        aria-label={t('gamePage.playPreview', { title: game.title })}
      >
        {screenshot ? (
          <img src={catalogMediaUrl(game.slug, screenshot.file, 1280)} alt="" decoding="async" />
        ) : game.media?.video ? (
          <video
            src={catalogMediaUrl(game.slug, game.media.video)}
            muted
            playsInline
            preload="metadata"
            aria-hidden="true"
          />
        ) : (
          <span className="game-page-preview-empty" aria-hidden="true">
            <PixelIcon name="play" size={28} />
          </span>
        )}
        <span className="game-page-preview-cta">
          <PixelIcon name="play" size={14} /> {t('gamePage.openTheater')}
        </span>
      </button>

      {screenshots.length > 1 ? (
        <section className="game-page-screenshots" aria-labelledby="game-page-screenshots-title">
          <h2 id="game-page-screenshots-title">{t('gamePage.screenshots')}</h2>
          <div className="game-page-screenshot-grid">
            {screenshots.map((candidate, index) => (
              <button
                key={candidate.file}
                type="button"
                className={`game-page-screenshot${candidate.file === screenshot?.file ? ' is-selected' : ''}`}
                onClick={() => setSelectedScreenshotName(candidate.name)}
                aria-label={t('gamePage.viewScreenshot', { number: index + 1 })}
                aria-pressed={candidate.file === screenshot?.file}
              >
                <img
                  src={catalogMediaUrl(game.slug, candidate.file, 320)}
                  alt=""
                  width={320}
                  height={180}
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {game.controls.trim() ? (
        <section className="game-page-controls" aria-labelledby="game-page-controls-title">
          <h2 id="game-page-controls-title">{t('player.howToPlay')}</h2>
          <p>{game.controls}</p>
        </section>
      ) : null}
    </article>
  );
}
