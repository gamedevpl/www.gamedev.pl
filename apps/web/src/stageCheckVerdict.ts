import type { SubmissionStatus } from './submissionApi.js';

// 'checking' still plays: checks run behind the creator, never in front.
export type StageCheck = 'passed' | 'failed' | 'checking' | null;

// The staged build's own verdict; unidentified stages never claim failure.
export function stageCheckVerdict(status: SubmissionStatus | null | undefined, version?: string | null): StageCheck {
  const build = version ? status?.recentBuilds?.find((entry) => entry.version === version) : undefined;
  // History is slug-wide: only the head's pending build is gating.
  if (build?.verdict === 'pending') return version === status?.progress?.headSha ? 'checking' : null;
  if (build) return build.verdict === 'green' ? 'passed' : 'failed';
  // The preview gate speaks only for the head commit it ran on.
  const gate = version && version === status?.progress?.headSha ? status?.previewGate : undefined;
  return gate ? (gate.green ? 'passed' : 'failed') : null;
}

// Live publication: the newest green publish build, if still listed.
export function publishedBuildVersion(status: SubmissionStatus | null | undefined): string | null {
  return status?.recentBuilds?.find((build) => build.mode === 'publish' && build.verdict === 'green')?.version ?? null;
}
