import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon, type PixelIconName } from '../../PixelIcon.js';
import {
  buildMediaUrl,
  type BuildEvent,
  type BuildEventKind,
  type BuildMediaItem,
  type BuildProgress,
} from '../../submissionApi.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { buildActivityFeed, type PendingRevision } from './buildActivityFeed.js';
import { ShotLightbox } from './ShotLightbox.js';
import '../../build-progress.css';

const QUIET_BUILD_MS = 15 * 60_000;

// Icon per feed entry: what kind of moment it was.
const EVENT_ICONS: Record<BuildEventKind, PixelIconName> = {
  step: 'wrench',
  milestone: 'star',
  asking: 'pencil',
  blocked: 'bolt',
  done: 'check',
};

export function BuildProgressPanel({
  token,
  progress,
  events,
  media,
  pendingRevisions,
}: {
  token: string;
  progress?: BuildProgress;
  events: BuildEvent[];
  media: BuildMediaItem[];
  pendingRevisions: PendingRevision[];
}) {
  const { t, i18n } = useTranslation();
  // A capture can vanish between listing and fetching — drop broken pictures.
  const [broken, setBroken] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<BuildMediaItem | null>(null);
  const shownMedia = media.filter((item) => !broken.includes(item.ref));
  const activity = buildActivityFeed(progress, events, pendingRevisions, shownMedia, t('statusView.gallery.caption'));
  const checklist = progress?.checklist ?? [];
  // The agent's own latest word: a pushed event, else its journal.
  const latestEvent = events[0];
  const headline = latestEvent?.text ?? progress?.note;

  if (checklist.length === 0 && activity.length === 0 && !headline) {
    return null;
  }

  // A count the agent reported beats one inferred from ticked checkboxes.
  const reportedProgress = events.find((event) => event.progress)?.progress;
  const doneCount = reportedProgress?.done ?? checklist.filter((item) => item.checked).length;
  const totalCount = reportedProgress?.total ?? checklist.length;
  const donePercent = totalCount === 0 ? 0 : (doneCount / totalCount) * 100;
  // What the agent says beats inferring from the checklist.
  const currentStep = headline ? undefined : checklist.find((item) => !item.checked);
  const lastUpdate = activity[activity.length - 1];
  // Silence with no explanation reads as broken — say so.
  const isQuiet = lastUpdate !== undefined && Date.now() - lastUpdate.at > QUIET_BUILD_MS;

  return (
    <div className="build-progress">
      {headline ? (
        <p className="build-progress-note" aria-live="polite">
          <span className="build-progress-note-label">
            {latestEvent?.step
              ? t(`statusView.progress.steps.${latestEvent.step}`)
              : t('statusView.progress.agentSays')}
          </span>
          <span className="build-progress-note-text">{headline}</span>
        </p>
      ) : null}

      {totalCount > 0 ? (
        <div className="build-progress-checklist">
          <div className="build-progress-heading-row">
            <h3 className="build-progress-heading">{t('statusView.progress.checklistTitle')}</h3>
            <span className="build-progress-count">
              {t('statusView.progress.checklistCount', { done: doneCount, total: totalCount })}
            </span>
          </div>
          <div
            className="build-progress-bar"
            role="progressbar"
            aria-valuenow={doneCount}
            aria-valuemin={0}
            aria-valuemax={totalCount}
          >
            <div className="build-progress-bar-fill" style={{ width: `${donePercent}%` }} />
          </div>
          {currentStep ? (
            <p className="build-progress-current">
              <span className="build-progress-current-spinner" aria-hidden="true" />
              {t('statusView.progress.currentStep', { step: currentStep.text })}
            </p>
          ) : null}
          <ul>
            {checklist.map((item, index) => (
              <li key={index} className={item.checked ? 'checklist-done' : 'checklist-pending'}>
                <span aria-hidden="true">
                  <PixelIcon name={item.checked ? 'check' : 'checkbox'} size={12} />
                </span>{' '}
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {activity.length > 0 ? (
        <div className="build-progress-commits">
          <div className="build-progress-heading-row">
            <h3 className="build-progress-heading">{t('statusView.progress.activityTitle')}</h3>
            {lastUpdate ? (
              <span className="build-progress-count">
                {t('statusView.progress.lastUpdate', {
                  time: formatRelativeTime(lastUpdate.at, i18n.language),
                })}
              </span>
            ) : null}
          </div>
          {isQuiet ? <p className="build-progress-quiet">{t('statusView.progress.quietHint')}</p> : null}
          <ul className="build-activity-list">
            {activity.map((entry, index) => (
              <li
                key={`${entry.kind}-${entry.at}-${index}`}
                className={[
                  'build-activity-item',
                  `build-activity-${entry.kind}`,
                  // The creator's messages sit on the other side, like any chat.
                  entry.kind === 'revision' ? 'is-mine' : '',
                  index === activity.length - 1 ? 'build-progress-commit-latest' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="build-activity-icon" aria-hidden="true">
                  <PixelIcon
                    name={
                      entry.kind === 'revision'
                        ? 'pencil'
                        : entry.kind === 'media'
                          ? 'eye'
                          : entry.kind === 'studio'
                            ? 'sparkle'
                            : entry.kind === 'event'
                              ? EVENT_ICONS[entry.eventKind ?? 'step']
                              : 'wrench'
                    }
                    size={12}
                  />
                </span>
                <span className="build-activity-body">
                  {entry.kind === 'revision' ? (
                    <span className="build-activity-label">
                      {entry.pending
                        ? t('statusView.progress.yourRequestSending')
                        : entry.relayed
                          ? t('statusView.progress.relayedRequest')
                          : t('statusView.progress.yourRequest')}
                    </span>
                  ) : entry.kind === 'studio' ? (
                    <span className="build-activity-label">{t('statusView.progress.studioVoice')}</span>
                  ) : entry.step ? (
                    // Closed set of steps — real translated copy, not a machine one.
                    <span className="build-activity-label">{t(`statusView.progress.steps.${entry.step}`)}</span>
                  ) : null}
                  <span className="build-activity-text">{entry.text}</span>
                  {entry.media ? (
                    <span className="build-activity-shots">
                      {entry.media.map((item) => (
                        <button
                          key={item.ref}
                          type="button"
                          className="build-activity-shot"
                          onClick={() => setZoomed(item)}
                          title={t('statusView.gallery.expand')}
                        >
                          <img
                            src={buildMediaUrl(token, item)}
                            alt={item.label || t('statusView.gallery.alt')}
                            loading="lazy"
                            onError={() => setBroken((refs) => [...refs, item.ref])}
                          />
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
                <time className="build-activity-time" dateTime={new Date(entry.at).toISOString()}>
                  {entry.pending ? '' : formatRelativeTime(entry.at, i18n.language)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {zoomed ? <ShotLightbox token={token} item={zoomed} onClose={() => setZoomed(null)} /> : null}
    </div>
  );
}
