import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { catalogMediaUrl, gamePageHandle, type CatalogEntry } from './catalog.js';
import { fetchGamePage, type GamePage as GamePageData } from './gamePageApi.js';
import { PixelIcon } from './PixelIcon.js';
import { ShareGameButton } from './ShareGameButton.js';
import { creatorPath, gamePath, playPath, studioPath } from './router.js';
import { isPlayVia, recordRemixStep, type PlayVia } from './visitTelemetry.js';
import { VoteWidget } from './VoteWidget.js';

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** Prefer a gameplay moment over an opening/title capture. */
function previewScreenshot(game: CatalogEntry) {
  const screenshots = game.media?.screenshots ?? [];
  return screenshots.find((shot) => shot.name !== 'opening') ?? screenshots[0] ?? null;
}

/**
 * Canonical public game page at `/:handle/:slug`.
 *
 * Landing page, not a player or agent workspace. Visitors get Play/Remix into
 * the sandboxed theater; the owning creator also gets Open in Studio.
 * Old tab URLs land here — those surfaces had no reliable public data.
 */
export function GamePage({
  handle,
  slug,
  onNavigate,
  onCanonicalPath,
  onGameLoaded,
  onPlay,
  onPlayTogether,
  onRemix,
}: {
  handle: string;
  slug: string;
  onNavigate: (path: string) => void;
  onCanonicalPath?: (path: string) => void;
  onGameLoaded?: (title: string) => void;
  onPlay?: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether?: (game: CatalogEntry, via?: PlayVia) => void;
  onRemix: (game: CatalogEntry, request: string) => void;
}) {
  const { t } = useTranslation();
  const { user, privateBeta } = useAuth();
  // Only the image link needs this; buttons don't navigate away.
  const [arrivalVia] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get('via');
    return isPlayVia(raw) ? raw : undefined;
  });
  const [page, setPage] = useState<GamePageData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const [selectedScreenshotFile, setSelectedScreenshotFile] = useState<string | null>(null);
  const [remixEntryOpen, setRemixEntryOpen] = useState(false);
  const [remixRequest, setRemixRequest] = useState('');
  const [remixTracksViewport, setRemixTracksViewport] = useState(false);
  const remixButtonRef = useRef<HTMLButtonElement | null>(null);
  const remixBackdropRef = useRef<HTMLDivElement | null>(null);
  const remixInputRef = useRef<HTMLTextAreaElement | null>(null);

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
    recordRemixStep(page.entry.editor === 'content' ? 'offered' : 'no_lane', { control: 'page' });
  }, [page, onGameLoaded]);

  const canonicalHandle = page?.entry.creatorHandle ?? null;
  useEffect(() => {
    if (state !== 'ready' || !page || !canonicalHandle) return;
    if (canonicalHandle.toLowerCase() !== handle.toLowerCase()) {
      onCanonicalPath?.(gamePath(canonicalHandle, slug));
    }
  }, [state, page, canonicalHandle, handle, slug, onCanonicalPath]);

  useEffect(() => {
    if (!remixEntryOpen) return;
    const trigger = remixButtonRef.current;
    const backdrop = remixBackdropRef.current;
    const viewport = window.visualViewport;
    let syncViewport: (() => void) | null = null;

    document.body.classList.add('remix-entry-open');

    // `100dvh` follows mobile browser chrome, but iOS only shrinks the visual
    // viewport for its keyboard. Measure that viewport directly so the action row
    // remains above the keys, including when Safari pans to reveal the textarea.
    if (viewport && backdrop) {
      syncViewport = () => {
        backdrop.style.setProperty('--remix-entry-viewport-height', `${viewport.height}px`);
        backdrop.style.setProperty('--remix-entry-viewport-offset', `${viewport.offsetTop}px`);
      };
      syncViewport();
      setRemixTracksViewport(true);
      viewport.addEventListener('resize', syncViewport);
      viewport.addEventListener('scroll', syncViewport);
    } else {
      setRemixTracksViewport(false);
    }

    remixInputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setRemixEntryOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = remixInputRef.current?.closest<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const stops = [...dialog.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)')];
      const first = stops[0];
      const last = stops[stops.length - 1];
      if (!first || !last) return;
      const outside = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('remix-entry-open');
      window.removeEventListener('keydown', onKeyDown);
      if (viewport && syncViewport) {
        viewport.removeEventListener('resize', syncViewport);
        viewport.removeEventListener('scroll', syncViewport);
      }
      trigger?.focus();
    };
  }, [remixEntryOpen]);

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
  const ownerHandle = creator?.handle ?? entry.creatorHandle ?? null;
  const isOwner = Boolean(user?.handle && ownerHandle && user.handle.toLowerCase() === ownerHandle.toLowerCase());
  const studioHref = studioPath(slug);

  const play = () => {
    if (playGated) {
      setAuthOpen(true);
      return;
    }
    onPlay?.(entry, arrivalVia);
    if (!onPlay) onNavigate(playPath(slug));
  };

  const playTogether = () => onPlayTogether?.(entry, arrivalVia);

  const openRemixEntry = () => {
    if (entry.editor !== 'content') return;
    recordRemixStep('opened', { control: 'page' });
    setRemixEntryOpen(true);
  };

  const closeRemixEntry = () => setRemixEntryOpen(false);

  const startRemix = (event: FormEvent) => {
    event.preventDefault();
    if (entry.editor !== 'content') return;
    const request = remixRequest.trim();
    if (request.length < 2) return;
    setRemixEntryOpen(false);
    onRemix(entry, request);
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
          {entry.editor === 'content' ? (
            <span className="game-page-genre game-page-editor-badge">
              <PixelIcon name="pencil" size={11} /> {t('catalog.editorBadge')}
            </span>
          ) : null}
        </nav>
        <h1>{entry.title}</h1>
        {page.description ? <p className="game-page-description">{page.description}</p> : null}
        <div className="game-page-actions" role="group" aria-label={t('gamePage.actions')}>
          <button type="button" className="primary-btn" onClick={play}>
            <PixelIcon name="play" size={13} /> {t('gamePage.play')}
          </button>
          {entry.multiplayer ? (
            <button type="button" className="secondary-btn party-btn" onClick={playTogether}>
              <PixelIcon name="phone" size={13} /> {t('party.playTogether')}
            </button>
          ) : null}
          <VoteWidget slug={slug} />
          {isOwner ? (
            <a
              className="secondary-btn game-page-studio"
              href={studioHref}
              onClick={intercept(() => onNavigate(studioHref))}
            >
              <PixelIcon name="wrench" size={13} /> {t('gamePage.openStudio')}
            </a>
          ) : null}
          {entry.editor === 'content' ? (
            <button type="button" className="secondary-btn game-page-remix" onClick={openRemixEntry} ref={remixButtonRef}>
              <PixelIcon name="wrench" size={13} /> {t('gamePage.remix')}
            </button>
          ) : null}
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

      {remixEntryOpen ? (
        <div
          ref={remixBackdropRef}
          className={`game-page-remix-backdrop${remixTracksViewport ? ' is-viewport-tracked' : ''}`}
          onClick={closeRemixEntry}
        >
          <section
            className="game-page-remix-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-page-remix-title"
            aria-describedby="game-page-remix-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="game-page-remix-dialog-head">
              <div>
                <h2 id="game-page-remix-title">{t('gamePage.remixEntryTitle')}</h2>
                <p id="game-page-remix-description">{t('gamePage.remixEntryDescription')}</p>
              </div>
              <button
                type="button"
                className="game-page-remix-close"
                onClick={closeRemixEntry}
                aria-label={t('gamePage.remixEntryClose')}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </div>
            <form className="game-page-remix-form" onSubmit={startRemix}>
              <label htmlFor="game-page-remix-request">{t('gamePage.remixEntryLabel')}</label>
              <textarea
                id="game-page-remix-request"
                ref={remixInputRef}
                value={remixRequest}
                onChange={(event) => setRemixRequest(event.target.value)}
                placeholder={t('gamePage.remixEntryPlaceholder')}
                maxLength={240}
                rows={4}
              />
              <div className="game-page-remix-form-actions">
                <button type="button" className="secondary-btn" onClick={closeRemixEntry}>
                  {t('gamePage.remixEntryCancel')}
                </button>
                <button type="submit" className="primary-btn" disabled={remixRequest.trim().length < 2}>
                  <PixelIcon name="wrench" size={13} /> {t('gamePage.remixEntrySubmit')}
                </button>
              </div>
            </form>
          </section>
        </div>
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
