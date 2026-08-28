import { useState, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { isPriorRoundDismissed, setPriorRoundDismissed } from '../../priorRoundDismiss.js';
import type { PriorRoundEntry, PriorRoundHistory } from '../../submissionApi.js';
import { formatRelativeTime } from '../../relativeTime.js';

/**
 * Superseded build jobs for this game, as collapsed blocks above the live thread.
 *
 * Publishing is terminal, so each improve opens a new empty job. Without these, days of
 * Studio chat look deleted even though they still live on the older job ids. Collapsed
 * by default; dismissible per round (local preference only).
 */
export function StudioPriorRounds({ slug, rounds }: { slug: string; rounds: PriorRoundHistory[] }) {
  const { t, i18n } = useTranslation();
  // Re-render after dismiss; visibility still reads localStorage so a remount stays honest.
  const [, bump] = useState(0);
  const visible = rounds.filter((round) => !isPriorRoundDismissed(slug, round.id));
  if (visible.length === 0) return null;

  const dismiss = (roundId: string, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setPriorRoundDismissed(slug, roundId, true);
    bump((n) => n + 1);
  };

  return (
    <div className="studio-prior-rounds" data-testid="studio-prior-rounds">
      {visible.map((round) => (
        <details key={round.id} className="studio-prior-round">
          <summary className="studio-prior-round-summary">
            <span className="studio-prior-round-label">
              {round.publishedAt ? t('statusView.history.summaryPublished') : t('statusView.history.summary')}
              <time dateTime={round.createdAt}>{formatRelativeTime(round.createdAt, i18n.language)}</time>
            </span>
            <button
              type="button"
              className="studio-prior-round-dismiss"
              onClick={(event) => dismiss(round.id, event)}
              aria-label={t('statusView.history.dismissAria')}
            >
              {t('statusView.history.dismiss')}
            </button>
          </summary>
          <ol className="studio-prior-round-turns">
            {round.entries.map((entry, index) => (
              <PriorRoundTurn key={`${entry.kind}-${entry.createdAt}-${index}`} entry={entry} />
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}

function PriorRoundTurn({ entry }: { entry: PriorRoundEntry }) {
  const { t, i18n } = useTranslation();
  const isStudioVoice = entry.kind === 'revision' && entry.origin === 'studio';
  const mine = entry.kind === 'revision' && !isStudioVoice;
  return (
    <li className={`studio-turn studio-prior-turn${mine ? ' is-mine' : ''}${isStudioVoice ? ' is-studio-voice' : ''}`}>
      <div className="studio-turn-body">
        {!mine && !isStudioVoice && entry.step ? (
          <span className="studio-turn-kicker">{t(`statusView.progress.steps.${entry.step}`)}</span>
        ) : null}
        {mine && entry.origin === 'agent' ? (
          <span className="studio-turn-kicker">{t('statusView.progress.relayedRequest')}</span>
        ) : null}
        {isStudioVoice ? (
          <span className="studio-turn-kicker studio-turn-kicker-studio">{t('statusView.progress.studioVoice')}</span>
        ) : null}
        <p className="studio-turn-text">{entry.text}</p>
      </div>
      <time className="studio-turn-time" dateTime={entry.createdAt}>
        {formatRelativeTime(entry.createdAt, i18n.language)}
      </time>
    </li>
  );
}
