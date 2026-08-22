import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { StudioBuildHistory } from './StudioBuildHistory.js';
import { getSubmissionStatus, type BuildEvent, type BuildProgress, type SubmissionStatus } from './submissionApi.js';

// Details refreshes slower than the thread's own live pulse.
const DETAILS_POLL_MS = 10_000;

// Props-driven; callers with their own status poll should feed it in, not refetch.
export function BuildProgressChecklist({
  progress,
  events,
  loaded,
  emptyLabel,
}: {
  progress: BuildProgress | null;
  events: BuildEvent[];
  // Whether the first fetch has completed.
  loaded: boolean;
  // Empty-state label shown when the checklist is empty.
  emptyLabel?: string;
}) {
  const { t } = useTranslation();

  const checklist = progress?.checklist ?? [];
  const reported = events.find((event) => event.progress)?.progress;
  const doneCount = reported?.done ?? checklist.filter((item) => item.checked).length;
  const totalCount = reported?.total ?? checklist.length;

  if (totalCount === 0) {
    if (!loaded) return <p className="studio-rail-empty">{t('statusView.loading')}</p>;
    if (emptyLabel) return <p className="studio-rail-empty">{emptyLabel}</p>;
    return null;
  }

  const donePercent = (doneCount / totalCount) * 100;
  const currentStep = checklist.find((item) => !item.checked);
  const note = events[0]?.text ?? progress?.note;

  return (
    <div className="studio-details-progress" data-testid="studio-details-progress">
      <div className="build-progress-heading-row">
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

// Self-fetching wrapper for callers with no status poll of their own.
export function StudioDetailsBuildProgress({
  token,
  emptyLabel,
  onSelectPreviewVersion,
  activePreviewVersion,
  onReverted,
}: {
  token: string;
  // Shown when there's neither a checklist nor build history yet.
  emptyLabel?: string;
  onSelectPreviewVersion?: (version: string | null) => void;
  activePreviewVersion?: string | null;
  onReverted?: (version: string) => void;
}) {
  const { i18n } = useTranslation();
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getSubmissionStatus(token, i18n.language);
        if (cancelled) return;
        setStatus(next);
      } catch {
        // Secondary chrome — a failed poll must not toast over the thread.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();
    const timer = window.setInterval(() => void load(), DETAILS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token, i18n.language]);

  const hasHistory = Boolean(status?.recentBuilds?.length);

  return (
    <>
      <BuildProgressChecklist
        progress={status?.progress ?? null}
        events={status?.events ?? []}
        loaded={loaded}
        emptyLabel={hasHistory ? undefined : emptyLabel}
      />
      {status ? (
        <StudioBuildHistory
          status={status}
          onSelectPreviewVersion={onSelectPreviewVersion}
          activePreviewVersion={activePreviewVersion}
          onReverted={onReverted}
        />
      ) : null}
    </>
  );
}
