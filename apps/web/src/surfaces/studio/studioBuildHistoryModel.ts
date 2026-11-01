import { isAwaitingVerification, isBuildLive, isCurrentBuild } from '../../buildLive.js';
import type { RecentBuild, SubmissionStatus } from '../../submissionApi.js';

export function buildHistoryVerdict(status: SubmissionStatus, build: RecentBuild) {
  if (build.verdict !== 'pending') return build.verdict;
  if (isAwaitingVerification(status, build)) return 'waiting';
  return isCurrentBuild(status, build) && isBuildLive(status) ? 'pending' : 'unverified';
}

export function formatBuildHistoryVerdict(
  t: (key: string, options?: Record<string, unknown>) => string,
  status: SubmissionStatus,
  build: RecentBuild,
): string {
  if (build.status === 'kit_outdated') return t('studioPanel.buildHistory.kitOutdated');
  if (build.status === 'timed_out' || build.status === 'crashed') {
    return t(`studioPanel.buildHistory.${build.status === 'timed_out' ? 'timedOut' : 'crashed'}`);
  }
  const verdict = buildHistoryVerdict(status, build);
  const base = t(`studioPanel.buildHistory.verdict.${verdict}`);
  if (verdict === 'red' && build.failedStage) {
    const stage = t(`studioPanel.buildHistory.stage.${build.failedStage}`, { defaultValue: build.failedStage });
    return `${base} · ${stage}`;
  }
  return base;
}

export function formatFailedStageBadge(
  t: (key: string, options?: Record<string, unknown>) => string,
  build: RecentBuild,
): string | null {
  if (build.verdict !== 'red' || !build.failedStage) return null;
  const stage = t(`studioPanel.buildHistory.stage.${build.failedStage}`, { defaultValue: build.failedStage });
  return t('studioPanel.buildHistory.failedStageLabel', { stage, id: build.failedStage });
}

export function formatBuildFailureGuidance(
  t: (key: string, options?: Record<string, unknown>) => string,
  build: RecentBuild,
): { reason: string; nextStep: string } | null {
  if (build.verdict !== 'red') return null;
  const fallback = t('studioPanel.buildHistory.failureReason.default');
  const key =
    build.status === 'kit_outdated' || build.status === 'timed_out' || build.status === 'crashed'
      ? build.status
      : (build.failedStage ?? 'default');
  return {
    reason: t(`studioPanel.buildHistory.failureReason.${key}`, { defaultValue: fallback }),
    nextStep: t('studioPanel.buildHistory.failureNextStep'),
  };
}

export function resolveBuildHistoryLiveKey(
  status: SubmissionStatus,
  head: RecentBuild | undefined,
  playingVersion: string | null | undefined,
): 'livePlaying' | 'live' | 'waiting' | 'failedIdle' | 'idle' {
  const live = isBuildLive(status);
  const playingPending = Boolean(playingVersion) && head?.verdict === 'pending' && head.version === playingVersion;
  if (live) return playingPending ? 'livePlaying' : 'live';
  if (isAwaitingVerification(status, head)) return 'waiting';
  return head?.verdict === 'red' ? 'failedIdle' : 'idle';
}

export function mergeBuildHistory(status: readonly RecentBuild[], fetched: readonly RecentBuild[]): RecentBuild[] {
  const versions = new Map(fetched.map((build) => [build.version, build]));
  for (const build of status) {
    const fetchedBuild = versions.get(build.version);
    if (build.verdict === 'pending' && fetchedBuild && fetchedBuild.verdict !== 'pending') continue;
    versions.set(build.version, build);
  }
  return [...versions.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || b.version.localeCompare(a.version),
  );
}
