import type { SubmissionStatus } from './submissionApi.js';

// A saved candidate is playable before verification finishes.
export function deliveredPreview(status: SubmissionStatus | null | undefined) {
  return status?.preview ? status.recentBuilds?.find((build) => build.version === status.progress?.headSha) : undefined;
}
