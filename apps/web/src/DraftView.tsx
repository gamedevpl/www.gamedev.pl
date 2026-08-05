import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublishedGame } from './catalog.js';
import { GameTheater } from './GameTheater.js';

type DraftViewProps = {
  slug: string;
  onExit: () => void;
  /**
   * Reports the draft's real name (or null while loading / on error) so App can
   * own `document.title` as the single writer — avoids stale titles when the
   * slug changes or the language switches mid-view.
   */
  onDraftTitle?: (title: string | null) => void;
};

/**
 * Unpublished half of `/play/<slug>`.
 *
 * Catalog games render {@link GameDetailPage} on the same URL. When the slug is
 * not in the catalog yet (owner draft, or a draft someone shared), this view
 * loads the playable document via `GET /api/games/:slug` and opens the theater
 * — the lifetime permalink stays `/play/<slug>` before and after publish.
 *
 * Legacy `/draft/<slug>` links rewrite to `/play/<slug>` in the router.
 */
export function DraftView({ slug, onExit, onDraftTitle }: DraftViewProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<{ title: string; html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onDraftTitle?.(draft?.title ?? null);
  }, [draft?.title, onDraftTitle]);

  useEffect(() => {
    return () => onDraftTitle?.(null);
  }, [onDraftTitle]);

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setError(null);

    fetchPublishedGame(slug)
      .then((result) => {
        if (!cancelled) setDraft({ title: result.title, html: result.html });
      })
      .catch(() => {
        if (!cancelled) setError(t('draft.notFound'));
      });

    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  // Same scroll lock the other players use: the theater is a fixed overlay, so the
  // page behind it must not scroll (or show through) while a game is open.
  useEffect(() => {
    if (!draft) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [draft]);

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

  if (!draft) {
    return (
      <section className="panel status-panel">
        <p className="catalog-state">
          <span className="status-preview-spinner" aria-hidden="true" /> {t('draft.loading')}
        </p>
      </section>
    );
  }

  return (
    <GameTheater
      title={draft.title}
      badge={{ icon: 'wrench', label: t('statusView.draftBadge') }}
      source={{ html: draft.html }}
      onExit={onExit}
    />
  );
}
