import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { catalogMediaUrl, gamePageHandle, type CatalogEntry } from './catalog.js';
import { fetchGamePage, type GamePage as GamePageData } from './gamePageApi.js';
import { PixelIcon } from './PixelIcon.js';
import { ShareGameButton } from './ShareGameButton.js';
import { creatorPath, gamePath, playPath } from './router.js';
import { recordRemixStep } from './visitTelemetry.js';
import { VoteWidget } from './VoteWidget.js';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** Prefer a gameplay moment over an opening/title capture. */
function previewScreenshot(game: CatalogEntry) {
  const screenshots = game.media?.screenshots ?? [];
  return screenshots.find((shot) => shot.name !== 'opening') ?? screenshots[0] ?? null;
}

/**
 * The canonical public game page at `/:handle/:slug`.
 *
 * This is a landing page, not a player and not an agent workspace. It gives a visitor
 * enough context to decide whether to play, then crosses the explicit Play/Remix
 * boundary into the existing sandboxed theater. Old tab URLs are accepted by the
 * router but intentionally land on this same compact page because those surfaces had
 * no reliable public data behind them.
 */
export function GamePage({
  handle,
  slug,
  onNavigate,
  onCanonicalPath,
  onGameLoaded,
  onPlay,
  onRemix,
}: {
  handle: string;
  slug: string;
  onNavigate: (path: string) => void;
  onCanonicalPath?: (path: string) => void;
  onGameLoaded?: (title: string) => void;
  onPlay?: (game: CatalogEntry) => void;
  onRemix?: (game: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  const { user, privateBeta } = useAuth();
  const [page, setPage] = useState<GamePageData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedScreenshotFile, setSelectedScreenshotFile] = useState<string | null>(null);

  const playGated = privateBeta && !user;

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setPage(null);
    setSelectedScreenshotFile(null);
    void fetchGamePage(slug)
      .then((loaded) => {
        if (cancelled) return;
        setPage(loaded);
        setState('ready');
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setState(err.code === 'not_found' ? 'missing' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    onGameLoaded?.(page.entry.title);
    recordRemixStep('offered', { control: 'page' });
  }, [page, onGameLoaded]);

  const canonicalHandle = page?.entry.creatorHandle ?? null;
  useEffect(() => {
    if (state !== 'ready' || !page || !canonicalHandle) return;
    if (canonicalHandle.toLowerCase() !== handle.toLowerCase()) {
      onCanonicalPath?.(gamePath(canonicalHandle, slug));
    }
  }, [state, page, canonicalHandle, handle, slug, onCanonicalPath]);

  if (state === 'loading') {
    return <p className="game-page-state">{t('gamePage.loading')}</p>;
  }
  if (state === 'missing') {
    return (
      <div className="game-page-state">
        <p>{t('gamePage.missing')}</p>
        <p>
          <a href={playPath(slug)} onClick={intercept(() => onNavigate(playPath(slug)))}>
            {t('gamePage.missingPlayLink')}
          </a>
        </p>
      </div>
    );
  }
  if (state === 'error' || !page) {
    return <p className="game-page-state game-page-error">{t('gamePage.error')}</p>;
  }

  const { entry, creator, platformAuthored } = page;
  const screenshots = entry.media?.screenshots ?? [];
  const primaryScreenshot = previewScreenshot(entry);
  const screenshot = screenshots.find((candidate) => candidate.file === selectedScreenshotFile) ?? primaryScreenshot;
  const authorPath = creator ? creatorPath(creator.handle) : null;
  const authorLabel = platformAuthored
    ? t('catalog.platformAuthor')
    : creator?.profileName?.trim() || creator?.handle || t('catalog.platformAuthor');
  const shareHandle = creator?.handle ?? gamePageHandle(entry);

  const play = () => {
    if (playGated) {
      setAuthOpen(true);
      return;
    }
    onPlay?.(entry);
    if (!onPlay) onNavigate(playPath(slug));
  };

  const remix = () => {
    if (playGated) {
      setAuthOpen(true);
      return;
    }
    recordRemixStep('opened', { control: 'page' });
    onRemix?.(entry);
    if (!onRemix) onNavigate(playPath(slug));
  };

  return (
    <article className="game-page">
      <header className="game-page-header">
        <nav className="game-page-breadcrumb" aria-label={t('gamePage.breadcrumbAria')}>
          {authorPath ? (
            <a href={authorPath} onClick={intercept(() => onNavigate(authorPath))}>
              {authorLabel}
            </a>
          ) : (
            <a href="/" onClick={intercept(() => onNavigate('/'))}>
              {authorLabel}
            </a>
          )}
          <span aria-hidden="true"> / </span>
          <span className="game-page-breadcrumb-slug">{slug}</span>
          {entry.genre ? <span className="game-page-genre">{entry.genre}</span> : null}
        </nav>
        <h1>{entry.title}</h1>
        {page.description ? <p className="game-page-description">{page.description}</p> : null}
        <div className="game-page-actions" role="group" aria-label={t('gamePage.actions')}>
          <button type="button" className="primary-btn" onClick={play}>
            <PixelIcon name="play" size={13} /> {t('gamePage.play')}
          </button>
          <VoteWidget slug={slug} />
          <button type="button" className="secondary-btn game-page-remix" onClick={remix}>
            <PixelIcon name="wrench" size={13} /> {t('gamePage.remix')}
          </button>
          <ShareGameButton slug={slug} title={entry.title} path={gamePath(shareHandle, slug)} />
        </div>
      </header>

      <button
        type="button"
        className="game-page-preview"
        onClick={play}
        aria-label={t('gamePage.playPreview', { title: entry.title })}
      >
        {screenshot ? (
          <img src={catalogMediaUrl(slug, screenshot.file, 1280)} alt="" decoding="async" />
        ) : entry.media?.video ? (
          <video
            src={catalogMediaUrl(slug, entry.media.video)}
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
                onClick={() => setSelectedScreenshotFile(candidate.file)}
                aria-label={t('gamePage.viewScreenshot', { number: index + 1 })}
                aria-pressed={candidate.file === screenshot?.file}
              >
                <img
                  src={catalogMediaUrl(slug, candidate.file, 320)}
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

      {entry.controls.trim() ? (
        <section className="game-page-controls" aria-labelledby="game-page-controls-title">
          <h2 id="game-page-controls-title">{t('player.howToPlay')}</h2>
          <p>{entry.controls}</p>
        </section>
      ) : null}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </article>
  );
}

function intercept(action: () => void) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault();
    action();
  };
}
