import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { fetchPublishedGame, type GameFetchError } from './catalog.js';
import { GameTheater } from './GameTheater.js';

type UnpublishedPlayViewProps = {
  slug: string;
  onExit: () => void;
  /**
   * Reports the game's real name (or null while loading / on error) so App can
   * own `document.title` as the single writer — avoids stale titles when the
   * slug changes or the language switches mid-view.
   */
  onTitle?: (title: string | null) => void;
};

/**
 * Unpublished half of `/play/<slug>`.
 *
 * Published games auto-open theater; Close replaces onto {@link GamePage}.
 * Missing catalog entries load via `GET /api/games/:slug` here instead.
 *
 * Legacy `/draft/<slug>` links rewrite to `/play/<slug>` in the router.
 */
export function UnpublishedPlayView({ slug, onExit, onTitle }: UnpublishedPlayViewProps) {
  const { t } = useTranslation();
  const [game, setGame] = useState<{ title: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTitle?.(game?.title ?? null);
  }, [game?.title, onTitle]);

  useEffect(() => {
    return () => onTitle?.(null);
  }, [onTitle]);

  useEffect(() => {
    let cancelled = false;
    setGame(null);
    setError(null);

    fetchPublishedGame(slug)
      .then((result) => {
        if (!cancelled) setGame({ title: result.title, html: result.html });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as GameFetchError).status;
        // 404/409: not shared / not ready / unknown. Anything else is a glitch — don't
        // tell the owner their draft vanished when the request just failed.
        setError(status === 404 || status === 409 ? t('draft.notFound') : t('draft.error'));
      });

    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  // Lock the page for loading and play — both are full-viewport overlays.
  useEffect(() => {
    if (error) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [error]);

  if (error) {
    return (
      <section className="panel status-panel">
        <h2 className="section-title">{t('draft.title')}</h2>
        <p className="error">{error}</p>
        <a
          className="inline-link"
          href="/"
          onClick={(event) => {
            if (event.defaultPrevented || event.button !== 0) return;
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            onExit();
          }}
        >
          {t('statusView.backHome')}
        </a>
      </section>
    );
  }

  if (!game) {
    // Match /play catalog wait: full-page mascot, not a spinner.
    return <AppLoadingScreen onExit={onExit} />;
  }

  return (
    <GameTheater
      title={game.title}
      badge={{ icon: 'wrench', label: t('statusView.draftBadge') }}
      source={{ html: game.html }}
      onExit={onExit}
    />
  );
}
