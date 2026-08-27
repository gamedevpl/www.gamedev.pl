import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isBuildLive, newestBuildIsCurrentRound } from './buildLive.js';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import { fetchGameBuilds } from './studioApi.js';
import { revertGameVersion, sealPreview, type RecentBuild, type SubmissionStatus } from './submissionApi.js';
import { StudioLiveRoundRow } from './StudioLiveRoundRow.js';

const DEFAULT_INITIAL_LIMIT = 5;

export function StudioBuildHistory({
  status,
  token,
  emptyLabel,
  onSelectPreviewVersion,
  activePreviewVersion,
  onReverted,
  onSealed,
}: {
  status: SubmissionStatus;
  // Only sealing needs this — the rest of the panel is slug-keyed.
  token?: string;
  // Shown when there's no live round and no build history.
  emptyLabel?: string;
  onSelectPreviewVersion?: (version: string | null) => void;
  activePreviewVersion?: string | null;
  onReverted?: (result: { version: string; token?: string; roundOpened?: number }) => void;
  // Called right after a successful seal, so the caller can refresh status immediately
  // rather than wait out its own poll — `canSeal` would otherwise stay stale that long.
  onSealed?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [expandedBuildVersion, setExpandedBuildVersion] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [extraBuilds, setExtraBuilds] = useState<RecentBuild[] | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [revertingVersion, setRevertingVersion] = useState<string | null>(null);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [revertSuccess, setRevertSuccess] = useState<string | null>(null);
  const [sealing, setSealing] = useState(false);
  const [sealError, setSealError] = useState<string | null>(null);
  const [sealSuccess, setSealSuccess] = useState(false);

  const statusBuilds = status.recentBuilds ?? [];
  const builds = extraBuilds ?? statusBuilds;

  useEffect(() => {
    // Reset extra builds when game / status changes
    setExtraBuilds(null);
  }, [status.slug]);

  const live = isBuildLive(status);
  const showLiveRoundRow = live && !newestBuildIsCurrentRound(builds, status);
  if (!showLiveRoundRow && builds.length === 0) {
    return emptyLabel ? <p className="studio-rail-empty">{emptyLabel}</p> : null;
  }

  const totalCount = status.totalBuildsCount ?? builds.length;
  const displayedBuilds = showAll ? builds : builds.slice(0, DEFAULT_INITIAL_LIMIT);

  const toggleExpand = (version: string) => {
    setExpandedBuildVersion((prev) => (prev === version ? null : version));
  };

  const handleToggleShowAll = async () => {
    if (!showAll && status.slug && totalCount > builds.length && !extraBuilds) {
      setLoadingOlder(true);
      try {
        const res = await fetchGameBuilds(status.slug, { limit: 100, locale: i18n.language });
        setExtraBuilds(res.builds);
      } catch {
        // Fall back to showing whatever we already have
      } finally {
        setLoadingOlder(false);
      }
    }
    setShowAll((prev) => !prev);
  };

  const handleRevert = async (build: RecentBuild) => {
    const slug = status.slug;
    if (!slug) return;
    const confirmMessage = t('studioPanel.buildHistory.revertConfirm', { version: build.version });
    if (!window.confirm(confirmMessage)) return;

    setRevertingVersion(build.version);
    setRevertError(null);
    setRevertSuccess(null);

    try {
      const outcome = await revertGameVersion(slug, build.version);
      setRevertSuccess(t('studioPanel.buildHistory.revertSuccess', { version: build.version }));
      onReverted?.({
        version: build.version,
        token: outcome.token,
        roundOpened: outcome.roundOpened,
      });
    } catch (err) {
      setRevertError(err instanceof Error ? err.message : String(err));
    } finally {
      setRevertingVersion(null);
    }
  };

  const handleSeal = async () => {
    if (!token) return;
    setSealing(true);
    setSealError(null);
    try {
      await sealPreview(token);
      setSealSuccess(true);
      onSealed?.();
    } catch (err) {
      setSealError(err instanceof Error ? err.message : String(err));
    } finally {
      setSealing(false);
    }
  };

  return (
    <div className="studio-build-history" data-testid="studio-build-history">
      <div className={`studio-build-history-live${live ? ' is-live' : ''}`}>
        <span className="live-dot" aria-hidden="true" />
        <span>{t(live ? 'studioPanel.buildHistory.live' : 'studioPanel.buildHistory.idle')}</span>
      </div>
      <div className="studio-build-history-header">
        <h3 className="studio-rail-section-title">{t('studioPanel.buildHistory.title')}</h3>
        {totalCount > builds.length || builds.length > DEFAULT_INITIAL_LIMIT ? (
          <span className="studio-build-history-count-badge" data-testid="studio-build-history-count">
            {t('studioPanel.buildHistory.showingCount', {
              shown: displayedBuilds.length,
              total: totalCount,
            })}
          </span>
        ) : null}
      </div>

      {revertSuccess ? (
        <div className="studio-build-history-alert is-success" role="status">
          {revertSuccess}
        </div>
      ) : null}
      {revertError ? (
        <div className="studio-build-history-alert is-error" role="alert">
          {revertError}
        </div>
      ) : null}
      {sealSuccess ? (
        <div className="studio-build-history-alert is-success" role="status">
          {t('statusView.seal.sent')}
        </div>
      ) : null}
      {sealError ? (
        <div className="studio-build-history-alert is-error" role="alert">
          {sealError}
        </div>
      ) : null}

      <ul className="studio-build-history-list">
        {showLiveRoundRow ? <StudioLiveRoundRow status={status} emptyLabel={t('studioPanel.rail.buildEmpty')} /> : null}
        {displayedBuilds.map((build, index) => {
          const isExpanded = expandedBuildVersion === build.version;
          const isPreviewing = activePreviewVersion === build.version;
          const canPreview = Boolean(onSelectPreviewVersion && build.verdict !== 'pending');
          const isReverting = revertingVersion === build.version;

          return (
            <li
              key={build.version}
              className={`studio-build-history-row is-${build.verdict}${isExpanded ? ' is-expanded' : ''}${isPreviewing ? ' is-active-preview' : ''}`}
            >
              <div
                className="studio-build-history-summary"
                onClick={() => toggleExpand(build.version)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpand(build.version);
                  }
                }}
                aria-expanded={isExpanded}
              >
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
                <span className="studio-build-history-expand-icon" aria-hidden="true">
                  <PixelIcon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={10} />
                </span>
              </div>

              {isExpanded ? (
                <div className="studio-build-history-details" data-testid={`build-details-${build.version}`}>
                  <div className="studio-build-history-meta">
                    <span className="studio-build-history-version-tag">
                      {t('studioPanel.buildHistory.versionLabel', { version: build.version })}
                    </span>
                    {build.authorship ? (
                      <span className="studio-build-history-authorship">
                        {t(`studioPanel.buildHistory.authorship.${build.authorship}`)}
                      </span>
                    ) : null}
                    {build.fileCount ? (
                      <span className="studio-build-history-file-count">
                        {t('studioPanel.buildHistory.fileCount', { count: build.fileCount })}
                      </span>
                    ) : null}
                  </div>

                  {build.summary ? (
                    <div className="studio-build-history-changelog">
                      <p className="studio-build-history-changelog-text">{build.summary}</p>
                    </div>
                  ) : null}

                  <div className="studio-build-history-actions">
                    {build.jobId === status.jobId && token && status.canSeal && build.mode === 'preview' ? (
                      <button
                        type="button"
                        className="studio-build-action-btn is-seal"
                        disabled={sealing || sealSuccess}
                        onClick={() => void handleSeal()}
                      >
                        <PixelIcon name="sparkle" size={12} />
                        <span>{sealing ? t('statusView.seal.sending') : t('statusView.seal.action')}</span>
                      </button>
                    ) : null}

                    {canPreview ? (
                      <button
                        type="button"
                        className={`studio-build-action-btn${isPreviewing ? ' is-active' : ''}`}
                        onClick={() => onSelectPreviewVersion?.(isPreviewing ? null : build.version)}
                      >
                        <PixelIcon name={isPreviewing ? 'eye' : 'play'} size={12} />
                        <span>
                          {isPreviewing ? t('studioPanel.preview.live') : t('studioPanel.buildHistory.previewAction')}
                        </span>
                      </button>
                    ) : null}

                    {status.slug && build.verdict !== 'pending' ? (
                      <button
                        type="button"
                        className="studio-build-action-btn is-revert"
                        disabled={isReverting || live}
                        onClick={() => void handleRevert(build)}
                      >
                        <PixelIcon name="undo" size={12} />
                        <span>
                          {isReverting
                            ? t('studioPanel.buildHistory.reverting')
                            : t('studioPanel.buildHistory.revertAction')}
                        </span>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {totalCount > DEFAULT_INITIAL_LIMIT || builds.length > DEFAULT_INITIAL_LIMIT ? (
        <button
          type="button"
          className="studio-build-history-toggle-all"
          disabled={loadingOlder}
          onClick={() => void handleToggleShowAll()}
        >
          {loadingOlder
            ? t('studioPanel.loading')
            : t(showAll ? 'studioPanel.buildHistory.showLess' : 'studioPanel.buildHistory.showAll')}
        </button>
      ) : null}
    </div>
  );
}
