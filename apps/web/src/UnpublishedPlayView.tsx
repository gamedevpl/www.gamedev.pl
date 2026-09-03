import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameLoadScreen } from './GameLoadScreen.js';
import { GameTheater } from './GameTheater.js';
import { usePublishedGameFetch } from './usePublishedGameFetch.js';

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
  const { game, progress, error: fetchError } = usePublishedGameFetch(slug);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onTitle?.(game?.title ?? null);
  }, [game?.title, onTitle]);

  useEffect(() => {
    return () => onTitle?.(null);
  }, [onTitle]);

  useEffect(() => {
    if (!fetchError) {
      setError(null);
      return;
    }
    const status = fetchError?.status;
    // 404/409: not shared / not ready / unknown. Anything else is a glitch — don't
    // tell the owner their draft vanished when the request just failed.
    setError(status === 404 || status === 409 ? t('draft.notFound') : t('draft.error'));
  }, [fetchError, t]);

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
    return <GameLoadScreen onExit={onExit} progress={progress} />;
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
