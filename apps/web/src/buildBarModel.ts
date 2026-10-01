// Turns the newest build into one honest readout.

import type { RecentBuild, SubmissionStatus } from './submissionApi.js';

export type BuildBarState = 'running' | 'green' | 'red' | 'starting';

export interface BuildBarModel {
  state: BuildBarState;
  // 0..1, or null before the first stage.
  fraction: number | null;
  label: string;
  etaMinutes: number | null;
  processingVersion?: string | null;
  processingTag?: string | null;
  liveVersion?: string | null;
  liveTag?: string | null;
}

// Median, so one outlier cannot move it.
export function medianGateMinutes(builds: readonly RecentBuild[] | undefined): number | null {
  const spans: number[] = [];
  for (const build of builds ?? []) {
    if (build.verdict === 'pending') continue;
    const span = build.finishedInMs;
    if (typeof span === 'number' && span > 0) spans.push(span);
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a - b);
  const mid = Math.floor(spans.length / 2);
  const ms = spans.length % 2 ? spans[mid]! : (spans[mid - 1]! + spans[mid]!) / 2;
  return Math.max(1, Math.round(ms / 60_000));
}

export function formatBuildTag(version: string | null | undefined): string | null {
  if (!version) return null;
  // Gate versions end in `-<hex>`; PR lane sends a bare sha.
  const match = version.match(/(?:^|-)([0-9a-f]{6,40})$/i);
  if (match) return `#${match[1].slice(0, 6).toLowerCase()}`;
  return version.length <= 10 ? `#${version}` : `#${version.slice(0, 8)}…`;
}

export function buildBarModel(
  status: SubmissionStatus | null | undefined,
  t: (key: string) => string,
  options?: { liveVersion?: string | null },
): BuildBarModel | null {
  const latest = status?.recentBuilds?.[0];
  if (!latest) return null;
  const eta = medianGateMinutes(status?.recentBuilds);
  const priorRound =
    typeof status?.jobId === 'number' && typeof latest.jobId === 'number' && latest.jobId !== status.jobId;
  // A prior round's newest build is not the one being processed.
  const processingVersion = priorRound ? null : (latest.version ?? null);
  const liveVersion = options?.liveVersion ?? null;
  const tags = {
    processingVersion,
    processingTag: formatBuildTag(processingVersion),
    liveVersion,
    liveTag: formatBuildTag(liveVersion),
  };

  if (priorRound) {
    return {
      state: 'starting',
      fraction: null,
      label: t('studioPanel.buildBar.roundInProgress'),
      etaMinutes: eta,
      ...tags,
    };
  }

  if (latest.verdict === 'pending') {
    const gate = status?.gateProgress;
    const total = gate?.total ?? latest.total ?? null;
    // Indeterminate, never a hard 0 that reads as stuck.
    if (!gate || !total) {
      return {
        state: 'starting',
        fraction: null,
        label: t('studioPanel.buildBar.starting'),
        etaMinutes: eta,
        ...tags,
      };
    }
    return {
      state: 'running',
      fraction: Math.min(1, (gate.index + 1) / total),
      label: t(`statusView.gateProgress.${gate.stage}`),
      etaMinutes: eta,
      ...tags,
    };
  }

  if (latest.verdict === 'red') {
    // Frozen where it died: early is ours, late is theirs.
    const total = latest.total ?? null;
    const fraction =
      total && typeof latest.failedIndex === 'number' ? Math.min(1, (latest.failedIndex + 1) / total) : 1;
    return {
      state: 'red',
      fraction,
      label: t('studioPanel.buildBar.failed'),
      etaMinutes: null,
      ...tags,
    };
  }

  return {
    state: 'green',
    fraction: 1,
    label: t('studioPanel.buildBar.passed'),
    etaMinutes: null,
    ...tags,
  };
}
