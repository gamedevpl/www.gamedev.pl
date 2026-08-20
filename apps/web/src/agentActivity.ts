import type { SubmissionStatus } from './submissionApi.js';

/**
 * When the build last did something worth seeing, or null before it has.
 *
 * The *agent's* moments only — never the creator's own change requests, which would
 * otherwise reset the heartbeat at the one moment they are waiting on a reply.
 * Shared by every surface with a heartbeat so they cannot drift apart on it.
 */
export function latestAgentActivityAt(status: SubmissionStatus | null | undefined): number | null {
  if (!status) return null;
  const times = [
    ...(status.lastAgentSignalAt ? [Date.parse(status.lastAgentSignalAt)] : []),
    ...(status.events ?? []).map((event) => Date.parse(event.createdAt)),
    ...(status.media ?? []).map((item) => (item.createdAt ? Date.parse(item.createdAt) : Number.NaN)),
    ...(status.playable ?? []).map((item) => (item.createdAt ? Date.parse(item.createdAt) : Number.NaN)),
    ...(status.progress?.commits ?? []).map((commit) => Date.parse(commit.committedDate)),
  ].filter((time) => Number.isFinite(time));
  return times.length > 0 ? Math.max(...times) : null;
}
