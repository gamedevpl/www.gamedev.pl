import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import type { BuildEvent, BuildProgress } from './submissionApi.js';

// Props-driven — feed in your own status poll, this never refetches.
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
  // Empty-state label for when there's no checklist or note yet.
  emptyLabel?: string;
}) {
  const { t } = useTranslation();

  const checklist = progress?.checklist ?? [];
  const reported = events.find((event) => event.progress)?.progress;
  const doneCount = reported?.done ?? checklist.filter((item) => item.checked).length;
  const totalCount = reported?.total ?? checklist.length;
  // Native rounds lack a checklist — the agent's note is the signal.
  const note = events[0]?.text ?? progress?.note;
  const currentStep = checklist.find((item) => !item.checked);

  if (totalCount === 0 && !note) {
    if (!loaded) return <p className="studio-rail-empty">{t('statusView.loading')}</p>;
    if (emptyLabel) return <p className="studio-rail-empty">{emptyLabel}</p>;
    return null;
  }

  const donePercent = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  return (
    <div className="studio-details-progress" data-testid="studio-details-progress">
      {totalCount > 0 ? (
        <>
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
        </>
      ) : null}
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
