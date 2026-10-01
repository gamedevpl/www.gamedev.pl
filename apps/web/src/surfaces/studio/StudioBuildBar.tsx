// One readout of the newest build.

import { useTranslation } from 'react-i18next';
import { buildBarModel } from '../../buildBarModel.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import './studio-strip.css';

export function StudioBuildBar({
  status,
  liveVersion,
  onOpen,
}: {
  status?: SubmissionStatus | null;
  liveVersion?: string | null;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const model = buildBarModel(status, t, { liveVersion });
  if (!model) return null;

  const pct = model.fraction === null ? null : Math.round(model.fraction * 100);
  const eta =
    model.etaMinutes !== null && (model.state === 'running' || model.state === 'starting')
      ? t('studioPanel.buildBar.eta').replace('{{minutes}}', String(model.etaMinutes))
      : null;

  const isChecking = model.state === 'running' || model.state === 'starting';
  const showLiveDifferent =
    model.liveTag && model.liveVersion && model.processingVersion && model.liveVersion !== model.processingVersion;
  const processingText = isChecking ? model.processingTag : null;
  const liveText = showLiveDifferent
    ? `${t('studioPanel.buildBar.livePrefix', 'Live: ')}${model.liveTag}`
    : !isChecking
      ? model.liveTag
      : null;
  // aria-label overrides visible text, so it carries the tags.
  const accessibleName = [t('studioPanel.buildBar.open'), model.label, processingText, liveText]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      className={`studio-build-bar is-${model.state}`}
      onClick={onOpen}
      aria-label={accessibleName}
      title={eta ? `${model.label} · ${eta}` : model.label}
      data-testid="studio-build-bar"
    >
      <span
        className="studio-build-bar-track"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={isChecking}
      >
        <span
          className={`studio-build-bar-fill${pct === null ? ' is-indeterminate' : ''}`}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </span>
      <span className="studio-build-bar-label">{model.label}</span>
      {processingText ? (
        <span className="studio-build-bar-tag is-processing" title={model.processingVersion ?? undefined}>
          {processingText}
        </span>
      ) : null}
      {liveText ? (
        <span
          className="studio-build-bar-tag is-live"
          title={t('studioPanel.buildBar.liveTitle', { version: model.liveVersion })}
        >
          {liveText}
        </span>
      ) : null}
      {eta ? <span className="studio-build-bar-eta">{eta}</span> : null}
    </button>
  );
}
