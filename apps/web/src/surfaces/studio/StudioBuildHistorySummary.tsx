import { useTranslation } from 'react-i18next';
import { formatBuildTag } from '../../buildBarModel.js';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import type { RecentBuild, SubmissionStatus } from '../../submissionApi.js';
import { formatBuildHistoryVerdict } from './studioBuildHistoryModel.js';

export function StudioBuildHistorySummary({
  build,
  status,
  expanded,
  live,
  playing,
  published,
  onToggle,
}: {
  build: RecentBuild;
  status: SubmissionStatus;
  expanded: boolean;
  live: boolean;
  playing: boolean;
  published: boolean;
  onToggle: () => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="studio-build-history-summary"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onToggle();
        }
      }}
      aria-expanded={expanded}
    >
      <span className={`studio-build-history-dot${live ? ' is-live' : ''}`} aria-hidden="true">
        {build.verdict === 'green' && <PixelIcon name="check" size={10} />}
        {build.verdict === 'red' && <PixelIcon name="close" size={10} />}
      </span>
      <span className="studio-build-history-mode">{t(`studioPanel.buildHistory.mode.${build.mode}`)}</span>
      <span className="studio-build-history-tag" title={build.version}>
        {formatBuildTag(build.version)}
      </span>
      {published ? (
        <span className="studio-build-history-public">{t('studioPanel.buildHistory.publicVersion')}</span>
      ) : null}
      {playing ? (
        <span className="studio-build-history-playing">
          <PixelIcon name="eye" size={10} /> {t('studioPanel.buildHistory.playing')}
        </span>
      ) : null}
      <span className="studio-build-history-verdict">{formatBuildHistoryVerdict(t, status, build)}</span>
      <time className="studio-build-history-time" dateTime={build.createdAt}>
        {formatRelativeTime(build.createdAt, i18n.language)}
      </time>
      <span className="studio-build-history-expand-icon" aria-hidden="true">
        <PixelIcon name={expanded ? 'chevronUp' : 'chevronDown'} size={10} />
      </span>
    </div>
  );
}
