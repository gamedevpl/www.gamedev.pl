import type { SubmissionStatus } from './submissionApi.js';

// The staged build's own verdict; unidentified stages never claim failure.
export function stageCheckVerdict(status: SubmissionStatus | null | undefined, version?: string | null) {
  const build = version ? status?.recentBuilds?.find((entry) => entry.version === version) : undefined;
  if (build) return build.verdict === 'pending' ? null : build.verdict === 'green';
  return status?.previewGate?.green ? true : null;
}

// Live publication: the newest green publish build, if still listed.
export function publishedBuildVersion(status: SubmissionStatus | null | undefined): string | null {
  return status?.recentBuilds?.find((build) => build.mode === 'publish' && build.verdict === 'green')?.version ?? null;
}
