import { useTranslation } from 'react-i18next';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import type { RecentBuild, SubmissionStatus } from './submissionApi.js';

// The Build pane used to go silent once a version landed.

// Not 'in_review': the gate already resolved, it's waiting on platform review.
const CURRENTLY_MOVING_STATUSES = new Set<SubmissionStatus['status']>(['building', 'publishing']);

function isBuildLive(status: SubmissionStatus, builds: RecentBuild[]): boolean {
  if (CURRENTLY_MOVING_STATUSES.has(status.status)) return true;
  if (status.gateProgress) return true;
  return builds[0]?.verdict === 'pending';
}

export function StudioBuildHistory({ status }: { status: SubmissionStatus }) {
  const { t, i18n } = useTranslation();
  const builds = status.recentBuilds ?? [];
  if (builds.length === 0) return null;

  const live = isBuildLive(status, builds);

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
              className={`studio-build-history-dot${build.verdict === 'pending' && index === 0 ? ' is-live' : ''}`}
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
