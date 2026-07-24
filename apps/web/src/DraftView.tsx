import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameTheater } from './GameTheater';
import { getDraftBySlug, type SubmissionApiError, type SubmissionPreview } from './submissionApi';

/**
 * `#/draft/<slug>` — an in-progress game opened by permalink instead of by status
 * token. This is the shareable view: it can play the build, and nothing else. The
 * creator's own status page keeps the token, and with it the ability to request
 * changes; anyone they send this link to just gets to watch the game take shape.
 */
export function DraftView({ slug, onExit }: { slug: string; onExit: () => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<SubmissionPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setError(null);

    getDraftBySlug(slug)
      .then((result) => {
        if (!cancelled) setDraft(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiError = err as SubmissionApiError;
        setError(apiError.status === 404 || apiError.status === 409 ? t('draft.notFound') : t('draft.error'));
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
        <a className="inline-link" href="#/">
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
