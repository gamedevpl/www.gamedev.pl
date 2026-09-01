// One readout of the newest build.

import { useTranslation } from 'react-i18next';
import { buildBarModel } from '../../buildBarModel.js';
import type { SubmissionStatus } from '../../submissionApi.js';
import './studio-strip.css';

export function StudioBuildBar({ status, onOpen }: { status?: SubmissionStatus | null; onOpen?: () => void }) {
  const { t } = useTranslation();
  const model = buildBarModel(status, t);
  if (!model) return null;

  const pct = model.fraction === null ? null : Math.round(model.fraction * 100);
  const eta =
    model.etaMinutes !== null && (model.state === 'running' || model.state === 'starting')
      ? t('studioPanel.buildBar.eta').replace('{{minutes}}', String(model.etaMinutes))
      : null;

  return (
    <button
      type="button"
      className={`studio-build-bar is-${model.state}`}
      onClick={onOpen}
      aria-label={t('studioPanel.buildBar.open')}
      title={eta ? `${model.label} · ${eta}` : model.label}
      data-testid="studio-build-bar"
    >
      <span
        className="studio-build-bar-track"
        role="progressbar"
        aria-valuenow={pct ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={model.state === 'running' || model.state === 'starting'}
      >
        <span
          className={`studio-build-bar-fill${pct === null ? ' is-indeterminate' : ''}`}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </span>
      <span className="studio-build-bar-label">{model.label}</span>
      {eta ? <span className="studio-build-bar-eta">{eta}</span> : null}
    </button>
  );
}
