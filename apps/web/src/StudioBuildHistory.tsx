import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import type { SubmissionStatus } from './submissionApi.js';

// Not 'in_review': the gate already resolved, it's waiting on platform review.
const CURRENTLY_MOVING_STATUSES = new Set<SubmissionStatus['status']>(['building', 'publishing']);

// The gate owning a delivery outranks an agent stall.
function isBuildLive(status: SubmissionStatus): boolean {
  if (status.gateProgress) return true;
  if (status.phase === 'submitted' || status.phase === 'gating') return true;
  if (status.stall) return false;
  return CURRENTLY_MOVING_STATUSES.has(status.status);
}

export function StudioBuildHistory({ status }: { status: SubmissionStatus }) {
  const { t, i18n } = useTranslation();
  const builds = status.recentBuilds ?? [];
  if (builds.length === 0) return null;

  const live = isBuildLive(status);

  return (
    <div className="studio-build-history" data-testid="studio-build-history">
      <div className={`studio-build-history-live${live ? ' is-live' : ''}`}>
        <span className="live-dot" aria-hidden="true" />
        <span>{t(live ? 'studioPanel.buildHistory.live' : 'studioPanel.buildHistory.idle')}</span>
      </div>
      <h3 className="studio-rail-section-title">{t('studioPanel.buildHistory.title')}</h3>
      <ul className="studio-build-history-list">
        {builds.map((build, index) => (
          <li key={build.version} className={`studio-build-history-row is-${build.verdict}`}>
            <span
              className={`studio-build-history-dot${live && index === 0 && build.verdict === 'pending' ? ' is-live' : ''}`}
              aria-hidden="true"
            >
              {build.verdict === 'green' ? (
                <PixelIcon name="check" size={10} />
              ) : build.verdict === 'red' ? (
                <PixelIcon name="close" size={10} />
              ) : null}
            </span>
            <span className="studio-build-history-mode">{t(`studioPanel.buildHistory.mode.${build.mode}`)}</span>
            <span className="studio-build-history-verdict">
              {build.status === 'kit_outdated'
                ? t('studioPanel.buildHistory.kitOutdated')
                : t(`studioPanel.buildHistory.verdict.${build.verdict}`)}
            </span>
            <time className="studio-build-history-time" dateTime={build.createdAt}>
              {formatRelativeTime(build.createdAt, i18n.language)}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}
