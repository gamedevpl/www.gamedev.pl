import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { getSubmissionStatus, type BuildEvent, type BuildProgress } from './submissionApi.js';

/** Details refreshes slower than the thread — the thread already owns the live pulse. */
const DETAILS_POLL_MS = 10_000;

/**
 * Checklist + fraction for the Details rail — the progress that used to sit in the
 * thread foot. Kept out of the composer strip so the conversation stays Claude-quiet;
 * open Details when you want the count.
 */
export function StudioDetailsBuildProgress({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const [progress, setProgress] = useState<BuildProgress | null>(null);
  const [events, setEvents] = useState<BuildEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const status = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;
        setProgress(status.progress ?? null);
        setEvents(status.events ?? []);
      } catch {
        // Secondary chrome — a failed poll must not toast over the thread.
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), DETAILS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, i18n.language]);

  const checklist = progress?.checklist ?? [];
  const reported = events.find((event) => event.progress)?.progress;
  const doneCount = reported?.done ?? checklist.filter((item) => item.checked).length;
  const totalCount = reported?.total ?? checklist.length;

  if (totalCount === 0) return null;

  const donePercent = (doneCount / totalCount) * 100;
  const currentStep = checklist.find((item) => !item.checked);
  const note = events[0]?.text ?? progress?.note;

  return (
    <div className="studio-details-progress" data-testid="studio-details-progress">
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
      {note ? (
        <p className="studio-details-progress-note">
          <span className="build-progress-note-label">
            {events[0]?.step ? t(`statusView.progress.steps.${events[0].step}`) : t('statusView.progress.agentSays')}
          </span>
          <span className="build-progress-note-text">{note}</span>
        </p>
      ) : currentStep ? (
        <p className="build-progress-current">
          <span className="build-progress-current-spinner" aria-hidden="true" />
          {t('statusView.progress.currentStep', { step: currentStep.text })}
        </p>
      ) : null}
      {checklist.length > 0 ? (
        <ul className="studio-details-checklist">
          {checklist.map((item, index) => (
            <li key={index} className={item.checked ? 'checklist-done' : 'checklist-pending'}>
              <span aria-hidden="true">
                <PixelIcon name={item.checked ? 'check' : 'checkbox'} size={12} />
              </span>{' '}
              {item.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
