import type { SubmissionStatus } from './submissionApi.js';

// 'checking' still plays: checks run behind the creator, never in front.
export type StageCheck = 'passed' | 'failed' | 'checking' | null;

// The staged build's own verdict; unidentified stages never claim failure.
export function stageCheckVerdict(status: SubmissionStatus | null | undefined, version?: string | null): StageCheck {
  const build = version ? status?.recentBuilds?.find((entry) => entry.version === version) : undefined;
  if (build) return build.verdict === 'pending' ? 'checking' : build.verdict === 'green' ? 'passed' : 'failed';
  // The preview gate speaks only for the head commit it ran on.
  const gate = version && version === status?.progress?.headSha ? status?.previewGate : undefined;
  return gate ? (gate.green ? 'passed' : 'failed') : null;
}

// Live publication: the newest green publish build, if still listed.
export function publishedBuildVersion(status: SubmissionStatus | null | undefined): string | null {
  return status?.recentBuilds?.find((build) => build.mode === 'publish' && build.verdict === 'green')?.version ?? null;
}
