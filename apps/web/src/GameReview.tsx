import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPublishedGame } from './catalog.js';
import { GameFrame } from './GameFrame.js';
import {
  approveCandidate,
  fetchGameReview,
  fetchReviewCandidate,
  type GameReview as GameReviewData,
} from './gameReviewApi.js';
import { PixelIcon } from './PixelIcon.js';
import { studioPath } from './router.js';

/**
 * "Do zagrania" — a change reviewed by playing it, not by reading it.
 *
 * Two playable frames side by side: what is live on the left, what was just built on
 * the right, both running in the same sandbox any other game runs in. Thirty seconds
 * of each answers the question a diff cannot, which is whether the change is *better*.
 * The line counts are underneath, collapsed, because they are a footnote here rather
 * than the subject (ops `docs/game-page-plan.md`).
 *
 * Signing off records that the creator played it and accepts it. It is deliberately
 * **not** a publish: putting a game on the site stays an operator action, because the
 * gate answers "does this run" and a human answers "may this be on the site", and only
 * the second is the moderation boundary. Asking for changes and walking away both live
 * in the Studio thread, where they already carry moderation and quota — this surface
 * links there rather than growing a second copy of them.
 */

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'forbidden' | 'error';

export function GameReview({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation();
  const [review, setReview] = useState<GameReviewData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [live, setLive] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);

  const load = useCallback(() => {
    let cancelled = false;
    setState('loading');
    void fetchGameReview(slug)
      .then((loaded) => {
        if (cancelled) return;
        setReview(loaded);
        setState('ready');
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setState(err.code === 'unauthorized' ? 'unauthorized' : err.code === 'forbidden' ? 'forbidden' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => load(), [load]);

  // Both documents are fetched only once a candidate exists — there is no comparison
  // to make otherwise, and the published half is a real play session's worth of bytes.
  const candidateVersion = review?.candidate?.version ?? null;
  useEffect(() => {
    if (!candidateVersion) return;
    let cancelled = false;
    void fetchPublishedGame(slug)
      .then((game) => {
        if (!cancelled) setLive(game.html);
      })
      .catch(() => {
        // A game with no published version yet simply has no left-hand frame.
        if (!cancelled) setLive(null);
      });
    void fetchReviewCandidate(slug, candidateVersion)
      .then((game) => {
        if (!cancelled) setCandidate(game.html);
      })
      .catch(() => {
        if (!cancelled) setCandidate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, candidateVersion]);

  const approve = useCallback(async () => {
    if (!review?.candidate) return;
    setApproving(true);
    setApproveError(null);
    try {
      await approveCandidate(slug, review.candidate.version);
      load();
    } catch (err) {
      setApproveError((err as { code?: string }).code ?? 'unknown');
    } finally {
      setApproving(false);
    }
  }, [review, slug, load]);

  if (state === 'loading') return <p className="game-page-status">{t('gamePage.review.loading')}</p>;
  if (state === 'unauthorized' || state === 'forbidden') {
    return (
      <section className="game-page-placeholder">
        <h2>{t('gamePage.tabs.review')}</h2>
        <p>{t(state === 'unauthorized' ? 'gamePage.review.signedOut' : 'gamePage.review.notYours')}</p>
      </section>
    );
  }
  if (state === 'error' || !review) {
    return <p className="game-page-status game-page-error">{t('gamePage.review.error')}</p>;
  }

  if (!review.candidate) {
    return (
      <section className="game-page-placeholder">
        <h2>{t('gamePage.tabs.review')}</h2>
        <p>{t('gamePage.review.empty')}</p>
      </section>
    );
  }

  const { candidate: pending, diff } = review;
  const gateRed = pending.gate ? !pending.gate.green : false;

  return (
    <section className="game-review" aria-label={t('gamePage.tabs.review')}>
      <header className="game-review-header">
        <h2 className="game-review-title">{pending.title}</h2>
        <p className="game-review-meta">
          {t('gamePage.review.builtOn', { date: formatDate(pending.createdAt, i18n.language) })}
          {pending.gate ? (
            <span className={`game-review-gate${pending.gate.green ? ' is-green' : ' is-red'}`}>
              {t(pending.gate.green ? 'gamePage.review.gatePassed' : 'gamePage.review.gateFailed')}
            </span>
          ) : (
            <span className="game-review-gate">{t('gamePage.review.gatePending')}</span>
          )}
        </p>
        <p className="game-review-instruction">{t('gamePage.review.instruction')}</p>
      </header>

      <div className="game-review-panes">
        <figure className="game-review-pane">
          <figcaption className="game-review-caption">
            {t('gamePage.review.liveCaption')}
            {review.baselineVersion ? <span className="game-review-version">{review.baselineVersion}</span> : null}
          </figcaption>
          {live ? (
            <GameFrame title={t('gamePage.review.liveCaption')} html={live} embed />
          ) : (
            <p className="game-review-missing">{t('gamePage.review.noLive')}</p>
          )}
        </figure>

        <figure className="game-review-pane">
          <figcaption className="game-review-caption is-candidate">
            {t('gamePage.review.candidateCaption')}
            <span className="game-review-version">{pending.version}</span>
          </figcaption>
          {candidate ? (
            <GameFrame title={t('gamePage.review.candidateCaption')} html={candidate} embed />
          ) : (
            <p className="game-review-missing">{t('gamePage.review.noCandidate')}</p>
          )}
        </figure>
      </div>

      {approveError ? (
        <p className="game-board-error" role="alert">
          {t(`gamePage.review.approveError.${approveError}`, {
            defaultValue: t('gamePage.review.approveError.unknown'),
          })}
        </p>
      ) : null}

      <div className="game-review-verdict">
        {!review.canSignOff ? (
          // An operator reviews but does not sign off: the sign-off speaks for the
          // creator, and the admin queue reads it back as exactly that.
          <p className="game-review-note">{t('gamePage.review.operatorCannotSignOff')}</p>
        ) : pending.approvedAt ? (
          <p className="game-review-approved">
            <PixelIcon name="check" size={13} />{' '}
            {t('gamePage.review.approved', { date: formatDate(pending.approvedAt, i18n.language) })}
          </p>
        ) : (
          <button
            type="button"
            className="primary-btn"
            onClick={() => void approve()}
            disabled={approving || gateRed}
            title={gateRed ? t('gamePage.review.gateFailedHint') : undefined}
          >
            <PixelIcon name="check" size={13} />{' '}
            {approving ? t('gamePage.review.approving') : t('gamePage.review.approve')}
          </button>
        )}
        <a className="secondary-btn" href={studioPath(slug, 'thread')}>
          <PixelIcon name="pencil" size={13} /> {t('gamePage.review.requestChanges')}
        </a>
      </div>
      <p className="game-review-note">{t('gamePage.review.publishNote')}</p>

      {diff && diff.filesChanged > 0 ? (
        <div className="game-review-diff">
          <button type="button" className="game-review-diff-toggle" onClick={() => setShowDiff((open) => !open)}>
            {t('gamePage.review.diffSummary', {
              files: diff.filesChanged,
              added: diff.added,
              removed: diff.removed,
            })}
            {diff.truncated ? ` ${t('gamePage.review.diffTruncated')}` : ''}
          </button>
          {showDiff ? (
            <ul className="game-review-diff-list">
              {diff.files.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  <span className="game-review-diff-counts">
                    {file.added === null || file.removed === null
                      ? t('gamePage.review.diffUncounted')
                      : `+${file.added} −${file.removed}`}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function formatDate(iso: string, language: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(parsed);
  } catch {
    return iso.slice(0, 10);
  }
}
